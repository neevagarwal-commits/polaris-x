import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader


# ============================================================
# POLARIS-X SEA ICE FORECAST MODEL
# 7 DAYS INPUT → 1 DAY FORECAST
# ============================================================

DATA_DIR = r".\data\ai_training\processed"
MODEL_DIR = r".\models"

INPUT_DAYS = 7
BATCH_SIZE = 4
EPOCHS = 20
LEARNING_RATE = 0.001

DOWNSAMPLE_FACTOR = 2


# ============================================================
# MODEL
# ============================================================

class SeaIceConvLSTM(nn.Module):

    def __init__(self):

        super().__init__()

        self.conv1 = nn.Conv2d(
            in_channels=1,
            out_channels=16,
            kernel_size=3,
            padding=1
        )

        self.conv2 = nn.Conv2d(
            in_channels=16,
            out_channels=32,
            kernel_size=3,
            padding=1
        )

        self.conv3 = nn.Conv2d(
            in_channels=32,
            out_channels=16,
            kernel_size=3,
            padding=1
        )

        self.output = nn.Conv2d(
            in_channels=16,
            out_channels=1,
            kernel_size=3,
            padding=1
        )

        self.relu = nn.ReLU()

    def forward(self, x):

        # x:
        # batch × time × height × width

        batch_size, time_steps, height, width = x.shape

        # Start with the most recent observation
        current = x[:, 0:1]

        for t in range(time_steps):

            current = x[:, t:t + 1]

            current = self.relu(
                self.conv1(current)
            )

            current = self.relu(
                self.conv2(current)
            )

            current = self.relu(
                self.conv3(current)
            )

        prediction = self.output(current)

        prediction = torch.sigmoid(prediction)

        return prediction


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    print("========================================")
    print(" POLARIS-X SEA ICE AI")
    print("========================================")

    print("\nLoading processed datasets...")

    X_train = np.load(
        os.path.join(DATA_DIR, "X_train.npy")
    )

    y_train = np.load(
        os.path.join(DATA_DIR, "y_train.npy")
    )

    X_val = np.load(
        os.path.join(DATA_DIR, "X_val.npy")
    )

    y_val = np.load(
        os.path.join(DATA_DIR, "y_val.npy")
    )

    X_test = np.load(
        os.path.join(DATA_DIR, "X_test.npy")
    )

    y_test = np.load(
        os.path.join(DATA_DIR, "y_test.npy")
    )

    print("\nOriginal shapes:")

    print("X_train:", X_train.shape)
    print("y_train:", y_train.shape)

    # ========================================================
    # DOWNSAMPLE
    # ========================================================

    print("\nDownsampling spatial resolution...")

    X_train = X_train[
        :,
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    y_train = y_train[
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    X_val = X_val[
        :,
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    y_val = y_val[
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    X_test = X_test[
        :,
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    y_test = y_test[
        :,
        ::DOWNSAMPLE_FACTOR,
        ::DOWNSAMPLE_FACTOR
    ]

    print("\nReduced shapes:")

    print("X_train:", X_train.shape)
    print("y_train:", y_train.shape)

    # ========================================================
    # CONVERT TO TORCH
    # ========================================================

    X_train = torch.tensor(
        X_train,
        dtype=torch.float32
    )

    y_train = torch.tensor(
        y_train,
        dtype=torch.float32
    )

    X_val = torch.tensor(
        X_val,
        dtype=torch.float32
    )

    y_val = torch.tensor(
        y_val,
        dtype=torch.float32
    )

    X_test = torch.tensor(
        X_test,
        dtype=torch.float32
    )

    y_test = torch.tensor(
        y_test,
        dtype=torch.float32
    )

    train_dataset = TensorDataset(
        X_train,
        y_train
    )

    val_dataset = TensorDataset(
        X_val,
        y_val
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False
    )

    return (
        train_loader,
        val_loader,
        X_test,
        y_test
    )


# ============================================================
# TRAINING
# ============================================================

def train():

    device = torch.device(
        "cuda" if torch.cuda.is_available()
        else "cpu"
    )

    print("\nDevice:", device)

    (
        train_loader,
        val_loader,
        X_test,
        y_test
    ) = load_data()

    model = SeaIceConvLSTM().to(device)

    criterion = nn.MSELoss()

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=LEARNING_RATE
    )

    best_val_loss = float("inf")

    os.makedirs(
        MODEL_DIR,
        exist_ok=True
    )

    print("\n========================================")
    print(" STARTING TRAINING")
    print("========================================")

    for epoch in range(EPOCHS):

        model.train()

        train_loss = 0.0

        for X_batch, y_batch in train_loader:

            X_batch = X_batch.to(device)

            y_batch = y_batch.to(device)

            optimizer.zero_grad()

            prediction = model(X_batch)

            prediction = prediction.squeeze(1)

            loss = criterion(
                prediction,
                y_batch
            )

            loss.backward()

            optimizer.step()

            train_loss += loss.item()

        train_loss /= len(train_loader)

        # ====================================================
        # VALIDATION
        # ====================================================

        model.eval()

        val_loss = 0.0

        with torch.no_grad():

            for X_batch, y_batch in val_loader:

                X_batch = X_batch.to(device)

                y_batch = y_batch.to(device)

                prediction = model(X_batch)

                prediction = prediction.squeeze(1)

                loss = criterion(
                    prediction,
                    y_batch
                )

                val_loss += loss.item()

        val_loss /= len(val_loader)

        print(
            f"Epoch {epoch + 1:02d}/{EPOCHS} "
            f"| Train Loss: {train_loss:.6f} "
            f"| Val Loss: {val_loss:.6f}"
        )

        # ====================================================
        # SAVE BEST MODEL
        # ====================================================

        if val_loss < best_val_loss:

            best_val_loss = val_loss

            torch.save(
                model.state_dict(),
                os.path.join(
                    MODEL_DIR,
                    "sea_ice_forecast.pt"
                )
            )

            print("  ✓ Best model saved")


    # ========================================================
    # TEST
    # ========================================================

    print("\n========================================")
    print(" TESTING MODEL")
    print("========================================")

    model.load_state_dict(
        torch.load(
            os.path.join(
                MODEL_DIR,
                "sea_ice_forecast.pt"
            ),
            map_location=device
        )
    )

    model.eval()

    X_test = X_test.to(device)

    y_test = y_test.to(device)

    with torch.no_grad():

        predictions = model(X_test)

        predictions = predictions.squeeze(1)

    # ========================================================
    # METRICS
    # ========================================================

    mse = torch.mean(
        (predictions - y_test) ** 2
    ).item()

    rmse = mse ** 0.5

    mae = torch.mean(
        torch.abs(
            predictions - y_test
        )
    ).item()

    print("\n========================================")
    print(" POLARIS-X MODEL PERFORMANCE")
    print("========================================")

    print(
        f"MAE  : {mae:.6f}"
    )

    print(
        f"RMSE : {rmse:.6f}"
    )

    print(
        f"MAE %: {mae * 100:.2f}%"
    )

    print(
        f"RMSE %: {rmse * 100:.2f}%"
    )

    print("\nModel saved to:")

    print(
        os.path.join(
            MODEL_DIR,
            "sea_ice_forecast.pt"
        )
    )


if __name__ == "__main__":

    train()