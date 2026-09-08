import os
import numpy as np
import torch
import torch.nn as nn
import matplotlib.pyplot as plt


DATA_DIR = r".\data\ai_training\processed"
MODEL_FILE = r".\models\sea_ice_forecast.pt"
OUTPUT_DIR = r".\data\ai_training\evaluation"


class SeaIceConvLSTM(nn.Module):

    def __init__(self):

        super().__init__()

        self.conv1 = nn.Conv2d(
            1, 16, kernel_size=3, padding=1
        )

        self.conv2 = nn.Conv2d(
            16, 32, kernel_size=3, padding=1
        )

        self.conv3 = nn.Conv2d(
            32, 16, kernel_size=3, padding=1
        )

        self.output = nn.Conv2d(
            16, 1, kernel_size=3, padding=1
        )

        self.relu = nn.ReLU()

    def forward(self, x):

        batch_size, time_steps, height, width = x.shape

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

        return torch.sigmoid(prediction)


def main():

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    print("========================================")
    print(" POLARIS-X SEA ICE EVALUATION")
    print("========================================")

    device = torch.device(
        "cuda" if torch.cuda.is_available()
        else "cpu"
    )

    print("\nDevice:", device)

    # --------------------------------------------------------
    # LOAD TEST DATA
    # --------------------------------------------------------

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

    # Same downsampling used during training
    X_test = X_test[
        :,
        :,
        ::2,
        ::2
    ]

    y_test = y_test[
        :,
        ::2,
        ::2
    ]

    X_test = torch.tensor(
        X_test,
        dtype=torch.float32
    ).to(device)

    y_test = torch.tensor(
        y_test,
        dtype=torch.float32
    ).to(device)

    # --------------------------------------------------------
    # LOAD MODEL
    # --------------------------------------------------------

    model = SeaIceConvLSTM().to(device)

    model.load_state_dict(
        torch.load(
            MODEL_FILE,
            map_location=device
        )
    )

    model.eval()

    # --------------------------------------------------------
    # PREDICT
    # --------------------------------------------------------

    print("\nGenerating predictions...")

    with torch.no_grad():

        predictions = model(
            X_test
        ).squeeze(1)

    # --------------------------------------------------------
    # SELECT EXAMPLE
    # --------------------------------------------------------

    sample = 0

    actual = (
        y_test[sample]
        .cpu()
        .numpy()
    )

    predicted = (
        predictions[sample]
        .cpu()
        .numpy()
    )

    error = np.abs(
        actual - predicted
    )

    # Convert to percentage
    actual_percent = actual * 100
    predicted_percent = predicted * 100
    error_percent = error * 100

    # --------------------------------------------------------
    # METRICS FOR THIS SAMPLE
    # --------------------------------------------------------

    mae = np.mean(error_percent)

    rmse = np.sqrt(
        np.mean(
            (actual_percent - predicted_percent) ** 2
        )
    )

    print("\nExample prediction:")
    print("MAE :", round(mae, 3), "%")
    print("RMSE:", round(rmse, 3), "%")

    # --------------------------------------------------------
    # PLOT ACTUAL
    # --------------------------------------------------------

    plt.figure(figsize=(9, 6))

    plt.imshow(
        actual_percent,
        origin="lower",
        vmin=0,
        vmax=100,
        aspect="auto"
    )

    plt.colorbar(
        label="Sea Ice Concentration (%)"
    )

    plt.title(
        "POLARIS-X — Actual Sea Ice Concentration"
    )

    plt.xlabel("Longitude Grid")
    plt.ylabel("Latitude Grid")

    plt.tight_layout()

    plt.savefig(
        os.path.join(
            OUTPUT_DIR,
            "actual.png"
        ),
        dpi=180
    )

    plt.close()

    # --------------------------------------------------------
    # PLOT PREDICTION
    # --------------------------------------------------------

    plt.figure(figsize=(9, 6))

    plt.imshow(
        predicted_percent,
        origin="lower",
        vmin=0,
        vmax=100,
        aspect="auto"
    )

    plt.colorbar(
        label="Sea Ice Concentration (%)"
    )

    plt.title(
        "POLARIS-X — AI Prediction"
    )

    plt.xlabel("Longitude Grid")
    plt.ylabel("Latitude Grid")

    plt.tight_layout()

    plt.savefig(
        os.path.join(
            OUTPUT_DIR,
            "prediction.png"
        ),
        dpi=180
    )

    plt.close()

    # --------------------------------------------------------
    # ERROR MAP
    # --------------------------------------------------------

    plt.figure(figsize=(9, 6))

    plt.imshow(
        error_percent,
        origin="lower",
        vmin=0,
        vmax=max(10, error_percent.max()),
        aspect="auto"
    )

    plt.colorbar(
        label="Absolute Error (%)"
    )

    plt.title(
        "POLARIS-X — Prediction Error"
    )

    plt.xlabel("Longitude Grid")
    plt.ylabel("Latitude Grid")

    plt.tight_layout()

    plt.savefig(
        os.path.join(
            OUTPUT_DIR,
            "error.png"
        ),
        dpi=180
    )

    plt.close()

    print("\n========================================")
    print(" EVALUATION COMPLETE")
    print("========================================")

    print("\nSaved:")

    print(
        os.path.join(
            OUTPUT_DIR,
            "actual.png"
        )
    )

    print(
        os.path.join(
            OUTPUT_DIR,
            "prediction.png"
        )
    )

    print(
        os.path.join(
            OUTPUT_DIR,
            "error.png"
        )
    )


if __name__ == "__main__":

    main()