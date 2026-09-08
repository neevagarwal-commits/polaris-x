import os
import time
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader


# ============================================================
# POLARIS-X REAL CONVLSTM — CPU OPTIMIZED
#
# INPUT:
#   7 consecutive days
#   Channel 0 = Sea Ice Concentration
#   Channel 1 = Valid Observation Mask
#
# OUTPUT:
#   Next day's Sea Ice Concentration
#
# DATA:
#   251 training samples
#   54 validation samples
#   54 testing samples
#
# TRAINING:
#   Original: 75 x 125
#   Training: 38 x 63
#
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

DATA_DIR = r".\data\ai_training\processed_v2"

MODEL_DIR = r".\models"

INPUT_DAYS = 7

BATCH_SIZE = 4

EPOCHS = 12

LEARNING_RATE = 0.001

# Additional spatial reduction for CPU training.
#
# 75 x 125
#      ↓
# 38 x 63
#
TRAIN_DOWNSAMPLE = 2

# Number of ConvLSTM hidden feature maps.
HIDDEN_CHANNELS = 8


# ============================================================
# CONVLSTM CELL
# ============================================================

class ConvLSTMCell(nn.Module):

    def __init__(
        self,
        input_channels,
        hidden_channels,
        kernel_size=3
    ):

        super().__init__()

        self.hidden_channels = hidden_channels

        padding = kernel_size // 2

        # Four gates:
        #
        # Input gate
        # Forget gate
        # Output gate
        # Candidate state
        #
        self.conv = nn.Conv2d(
            input_channels + hidden_channels,
            hidden_channels * 4,
            kernel_size=kernel_size,
            padding=padding
        )

    def forward(
        self,
        x,
        hidden_state
    ):

        h, c = hidden_state

        # ----------------------------------------------------
        # Combine current input with previous hidden state
        # ----------------------------------------------------

        combined = torch.cat(
            [x, h],
            dim=1
        )

        # ----------------------------------------------------
        # Calculate the four LSTM gates
        # ----------------------------------------------------

        gates = self.conv(
            combined
        )

        i, f, o, g = torch.chunk(
            gates,
            4,
            dim=1
        )

        # Input gate
        i = torch.sigmoid(i)

        # Forget gate
        f = torch.sigmoid(f)

        # Output gate
        o = torch.sigmoid(o)

        # Candidate state
        g = torch.tanh(g)

        # ----------------------------------------------------
        # Update cell state
        # ----------------------------------------------------

        c_next = (
            f * c +
            i * g
        )

        # ----------------------------------------------------
        # Update hidden state
        # ----------------------------------------------------

        h_next = (
            o * torch.tanh(c_next)
        )

        return h_next, c_next

    def init_hidden(
        self,
        batch_size,
        height,
        width,
        device
    ):

        h = torch.zeros(
            batch_size,
            self.hidden_channels,
            height,
            width,
            device=device
        )

        c = torch.zeros(
            batch_size,
            self.hidden_channels,
            height,
            width,
            device=device
        )

        return h, c


# ============================================================
# SEA ICE CONVLSTM MODEL
# ============================================================

class SeaIceConvLSTM(nn.Module):

    def __init__(self):

        super().__init__()

        # ----------------------------------------------------
        # Temporal-spatial encoder
        # ----------------------------------------------------

        self.convlstm = ConvLSTMCell(
            input_channels=2,
            hidden_channels=HIDDEN_CHANNELS,
            kernel_size=3
        )

        # ----------------------------------------------------
        # Decoder
        #
        # Converts the final ConvLSTM hidden state into
        # tomorrow's sea-ice concentration map.
        # ----------------------------------------------------

        self.decoder = nn.Sequential(

            nn.Conv2d(
                HIDDEN_CHANNELS,
                16,
                kernel_size=3,
                padding=1
            ),

            nn.ReLU(),

            nn.Conv2d(
                16,
                8,
                kernel_size=3,
                padding=1
            ),

            nn.ReLU(),

            nn.Conv2d(
                8,
                1,
                kernel_size=3,
                padding=1
            ),

            # Sea-ice concentration is normalized to
            # the range 0-1.
            nn.Sigmoid()
        )

    def forward(self, x):

        # ----------------------------------------------------
        # Expected input:
        #
        # batch
        # time
        # channels
        # height
        # width
        #
        # Example:
        #
        # (4, 7, 2, 38, 63)
        # ----------------------------------------------------

        batch_size = x.size(0)

        time_steps = x.size(1)

        height = x.size(3)

        width = x.size(4)

        device = x.device

        # ----------------------------------------------------
        # Initialize hidden and cell states
        # ----------------------------------------------------

        h, c = self.convlstm.init_hidden(
            batch_size,
            height,
            width,
            device
        )

        # ----------------------------------------------------
        # PROCESS THE 7 DAYS SEQUENTIALLY
        # ----------------------------------------------------

        for t in range(time_steps):

            current_day = x[:, t]

            h, c = self.convlstm(
                current_day,
                (h, c)
            )

        # ----------------------------------------------------
        # Decode final temporal state
        # ----------------------------------------------------

        prediction = self.decoder(
            h
        )

        # Remove single output channel.
        #
        # From:
        # (batch, 1, height, width)
        #
        # To:
        # (batch, height, width)

        return prediction.squeeze(1)


# ============================================================
# MASKED MSE LOSS
# ============================================================

def masked_mse_loss(
    prediction,
    target,
    mask
):

    # --------------------------------------------------------
    # Squared prediction error
    # --------------------------------------------------------

    squared_error = (
        prediction - target
    ) ** 2

    # --------------------------------------------------------
    # Ignore invalid/missing pixels
    # --------------------------------------------------------

    masked_error = (
        squared_error * mask
    )

    valid_pixels = mask.sum()

    if valid_pixels.item() == 0:

        return masked_error.mean()

    return (
        masked_error.sum()
        / valid_pixels
    )


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    print(
        "\nLoading V2 datasets..."
    )

    # ========================================================
    # TRAINING DATA
    # ========================================================

    X_train = np.load(
        os.path.join(
            DATA_DIR,
            "X_train.npy"
        )
    )

    y_train = np.load(
        os.path.join(
            DATA_DIR,
            "y_train.npy"
        )
    )

    mask_train = np.load(
        os.path.join(
            DATA_DIR,
            "mask_train.npy"
        )
    )

    # ========================================================
    # VALIDATION DATA
    # ========================================================

    X_val = np.load(
        os.path.join(
            DATA_DIR,
            "X_val.npy"
        )
    )

    y_val = np.load(
        os.path.join(
            DATA_DIR,
            "y_val.npy"
        )
    )

    mask_val = np.load(
        os.path.join(
            DATA_DIR,
            "mask_val.npy"
        )
    )

    # ========================================================
    # TEST DATA
    # ========================================================

    X_test = np.load(
        os.path.join(
            DATA_DIR,
            "X_test.npy"
        )
    )

    y_test = np.load(
        os.path.join(
            DATA_DIR,
            "y_test.npy"
        )
    )

    mask_test = np.load(
        os.path.join(
            DATA_DIR,
            "mask_test.npy"
        )
    )

    print(
        "Original X_train:",
        X_train.shape
    )

    print(
        "Original y_train:",
        y_train.shape
    )

    # ========================================================
    # ADDITIONAL SPATIAL DOWNSAMPLING
    # ========================================================

    print(
        "\nApplying CPU training downsampling..."
    )

    # IMPORTANT:
    #
    # X has:
    #
    # samples × time × channels × height × width
    #
    # Therefore:
    #
    # :  = samples
    # :  = time
    # :  = channels
    # ::2 = height
    # ::2 = width
    #
    # We MUST NOT downsample the channel dimension.

    X_train = X_train[
        :,
        :,
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    y_train = y_train[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    mask_train = mask_train[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    X_val = X_val[
        :,
        :,
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    y_val = y_val[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    mask_val = mask_val[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    X_test = X_test[
        :,
        :,
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    y_test = y_test[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    mask_test = mask_test[
        :,
        ::TRAIN_DOWNSAMPLE,
        ::TRAIN_DOWNSAMPLE
    ]

    # ========================================================
    # PRINT FINAL SHAPES
    # ========================================================

    print(
        "Reduced X_train:",
        X_train.shape
    )

    print(
        "Reduced y_train:",
        y_train.shape
    )

    print(
        "Reduced X_val:",
        X_val.shape
    )

    print(
        "Reduced y_val:",
        y_val.shape
    )

    print(
        "Reduced X_test:",
        X_test.shape
    )

    print(
        "Reduced y_test:",
        y_test.shape
    )

    # ========================================================
    # CONVERT TO TORCH
    # ========================================================

    X_train = torch.from_numpy(
        X_train
    )

    y_train = torch.from_numpy(
        y_train
    )

    mask_train = torch.from_numpy(
        mask_train
    )

    X_val = torch.from_numpy(
        X_val
    )

    y_val = torch.from_numpy(
        y_val
    )

    mask_val = torch.from_numpy(
        mask_val
    )

    X_test = torch.from_numpy(
        X_test
    )

    y_test = torch.from_numpy(
        y_test
    )

    mask_test = torch.from_numpy(
        mask_test
    )

    # ========================================================
    # DATASETS
    # ========================================================

    train_dataset = TensorDataset(
        X_train,
        y_train,
        mask_train
    )

    val_dataset = TensorDataset(
        X_val,
        y_val,
        mask_val
    )

    # ========================================================
    # DATA LOADERS
    # ========================================================

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0
    )

    return (
        train_loader,
        val_loader,
        X_test,
        y_test,
        mask_test
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print(
        "========================================"
    )

    print(
        " POLARIS-X CPU-OPTIMIZED CONVLSTM"
    )

    print(
        "========================================"
    )

    # ========================================================
    # CONFIGURATION DISPLAY
    # ========================================================

    print(
        "\nModel configuration:"
    )

    print(
        "Input days:",
        INPUT_DAYS
    )

    print(
        "Input channels: 2"
    )

    print(
        "Hidden channels:",
        HIDDEN_CHANNELS
    )

    print(
        "Batch size:",
        BATCH_SIZE
    )

    print(
        "Epochs:",
        EPOCHS
    )

    print(
        "Training downsample:",
        TRAIN_DOWNSAMPLE
    )

    # ========================================================
    # DEVICE
    # ========================================================

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    print(
        "\nDevice:",
        device
    )

    # ========================================================
    # CPU THREAD CONTROL
    # ========================================================

    if device.type == "cpu":

        cpu_count = (
            os.cpu_count()
            or 4
        )

        torch.set_num_threads(
            max(
                1,
                min(
                    8,
                    cpu_count
                )
            )
        )

        print(
            "CPU threads:",
            torch.get_num_threads()
        )

    # ========================================================
    # LOAD DATA
    # ========================================================

    (
        train_loader,
        val_loader,
        X_test,
        y_test,
        mask_test
    ) = load_data()

    # ========================================================
    # CREATE MODEL
    # ========================================================

    model = SeaIceConvLSTM().to(
        device
    )

    print(
        "\nModel parameters:",
        sum(
            p.numel()
            for p in model.parameters()
        )
    )

    # ========================================================
    # OPTIMIZER
    # ========================================================

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=LEARNING_RATE
    )

    # ========================================================
    # MODEL STORAGE
    # ========================================================

    os.makedirs(
        MODEL_DIR,
        exist_ok=True
    )

    model_path = os.path.join(
        MODEL_DIR,
        "sea_ice_convlstm.pt"
    )

    best_val_loss = float(
        "inf"
    )

    # ========================================================
    # TRAINING
    # ========================================================

    print(
        "\n========================================"
    )

    print(
        " STARTING TRAINING"
    )

    print(
        "========================================"
    )

    overall_start = time.time()

    for epoch in range(EPOCHS):

        epoch_start = time.time()

        # ====================================================
        # TRAIN MODE
        # ====================================================

        model.train()

        train_loss = 0.0

        for (
            X_batch,
            y_batch,
            mask_batch
        ) in train_loader:

            X_batch = X_batch.to(
                device
            )

            y_batch = y_batch.to(
                device
            )

            mask_batch = mask_batch.to(
                device
            )

            # ------------------------------------------------
            # Clear old gradients
            # ------------------------------------------------

            optimizer.zero_grad()

            # ------------------------------------------------
            # Forward pass
            # ------------------------------------------------

            prediction = model(
                X_batch
            )

            # ------------------------------------------------
            # Calculate masked loss
            # ------------------------------------------------

            loss = masked_mse_loss(
                prediction,
                y_batch,
                mask_batch
            )

            # ------------------------------------------------
            # Backpropagation
            # ------------------------------------------------

            loss.backward()

            # ------------------------------------------------
            # Update model
            # ------------------------------------------------

            optimizer.step()

            train_loss += loss.item()

        train_loss /= len(
            train_loader
        )

        # ====================================================
        # VALIDATION
        # ====================================================

        model.eval()

        val_loss = 0.0

        with torch.no_grad():

            for (
                X_batch,
                y_batch,
                mask_batch
            ) in val_loader:

                X_batch = X_batch.to(
                    device
                )

                y_batch = y_batch.to(
                    device
                )

                mask_batch = mask_batch.to(
                    device
                )

                prediction = model(
                    X_batch
                )

                loss = masked_mse_loss(
                    prediction,
                    y_batch,
                    mask_batch
                )

                val_loss += loss.item()

        val_loss /= len(
            val_loader
        )

        epoch_time = (
            time.time()
            - epoch_start
        )

        # ====================================================
        # PRINT EPOCH RESULT
        # ====================================================

        print(
            f"Epoch {epoch + 1:02d}/{EPOCHS} "
            f"| Train: {train_loss:.6f} "
            f"| Val: {val_loss:.6f} "
            f"| Time: {epoch_time:.1f}s"
        )

        # ====================================================
        # SAVE BEST MODEL
        # ====================================================

        if val_loss < best_val_loss:

            best_val_loss = val_loss

            torch.save(
                model.state_dict(),
                model_path
            )

            print(
                "  ✓ Best model saved"
            )

    # ========================================================
    # TESTING
    # ========================================================

    print(
        "\n========================================"
    )

    print(
        " TESTING CONVLSTM"
    )

    print(
        "========================================"
    )

    # ========================================================
    # LOAD BEST MODEL
    # ========================================================

    model.load_state_dict(
        torch.load(
            model_path,
            map_location=device
        )
    )

    model.eval()

    # ========================================================
    # TEST DATASET
    # ========================================================

    test_dataset = TensorDataset(
        X_test,
        y_test,
        mask_test
    )

    test_loader = DataLoader(
        test_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0
    )

    # ========================================================
    # METRIC ACCUMULATORS
    # ========================================================

    total_absolute_error = 0.0

    total_squared_error = 0.0

    total_valid_pixels = 0.0

    # ========================================================
    # TEST
    # ========================================================

    with torch.no_grad():

        for (
            X_batch,
            y_batch,
            mask_batch
        ) in test_loader:

            X_batch = X_batch.to(
                device
            )

            y_batch = y_batch.to(
                device
            )

            mask_batch = mask_batch.to(
                device
            )

            prediction = model(
                X_batch
            )

            error = (
                prediction - y_batch
            )

            total_absolute_error += (
                torch.abs(error)
                * mask_batch
            ).sum().item()

            total_squared_error += (
                error ** 2
                * mask_batch
            ).sum().item()

            total_valid_pixels += (
                mask_batch.sum().item()
            )

    # ========================================================
    # FINAL METRICS
    # ========================================================

    mae = (
        total_absolute_error
        / total_valid_pixels
    )

    mse = (
        total_squared_error
        / total_valid_pixels
    )

    rmse = mse ** 0.5

    total_time = (
        time.time()
        - overall_start
    )

    # ========================================================
    # RESULTS
    # ========================================================

    print(
        "\n========================================"
    )

    print(
        " POLARIS-X CONVLSTM PERFORMANCE"
    )

    print(
        "========================================"
    )

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

    print(
        f"\nBest validation loss: "
        f"{best_val_loss:.6f}"
    )

    print(
        f"Total runtime: "
        f"{total_time / 60:.2f} minutes"
    )

    print(
        "\nModel saved to:"
    )

    print(
        model_path
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()