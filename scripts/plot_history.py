import os
import sys
import pandas as pd
import matplotlib.pyplot as plt

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Style configurations similar to generate_figures.py
plt.rcParams.update({
    "font.family": "serif",
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.labelsize": 10,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.fontsize": 9,
    "figure.dpi": 300,
})

COLORS = ["#2563eb", "#dc2626"] # Blue for train, Red for validation

def main():
    option_name = "option4"
    if len(sys.argv) > 1:
        option_name = sys.argv[1]

    history_path = os.path.join(BASE_DIR, "models", "artifacts", option_name, "training_history.csv")
    figures_dir = os.path.join(BASE_DIR, "models", "artifacts", option_name, "figures")
    os.makedirs(figures_dir, exist_ok=True)
    output_path = os.path.join(figures_dir, "training_history_plot.png")

    if not os.path.exists(history_path):
        print(f"Error: Could not find {history_path}")
        return

    # Load history
    df = pd.read_csv(history_path)
    # Check if 'epoch' exists. Deep Hybrid models might use just 'loss', 'val_loss', etc., but option1 and option4 use epoch
    epochs = df["epoch"] if "epoch" in df.columns else range(1, len(df) + 1)

    # Create figure with 2 subplots like Option 1
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.5))

    # MAE Convergence Plot
    if "train_mae" in df.columns:
        axes[0].plot(epochs, df["train_mae"], color=COLORS[0], label="Train", linewidth=1.5, marker="o")
        if "val_mae" in df.columns:
            axes[0].plot(epochs, df["val_mae"], color=COLORS[1], label="Validation", linewidth=1.5, linestyle="--", marker="o")
    elif "mae" in df.columns:
        axes[0].plot(epochs, df["mae"], color=COLORS[0], label="Train", linewidth=1.5, marker="o")
        if "val_mae" in df.columns:
            axes[0].plot(epochs, df["val_mae"], color=COLORS[1], label="Validation", linewidth=1.5, linestyle="--", marker="o")
        
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("MAE")
    axes[0].set_title(f"{option_name.capitalize()}: MAE Convergence")
    axes[0].legend()
    axes[0].grid(True, linestyle=":", alpha=0.6)

    # RMSE Convergence Plot
    if "train_rmse" in df.columns:
        axes[1].plot(epochs, df["train_rmse"], color=COLORS[0], label="Train", linewidth=1.5, marker="o")
        if "val_rmse" in df.columns:
            axes[1].plot(epochs, df["val_rmse"], color=COLORS[1], label="Validation", linewidth=1.5, linestyle="--", marker="o")
    elif "rmse" in df.columns:
        axes[1].plot(epochs, df["rmse"], color=COLORS[0], label="Train", linewidth=1.5, marker="o")
        if "val_rmse" in df.columns:
            axes[1].plot(epochs, df["val_rmse"], color=COLORS[1], label="Validation", linewidth=1.5, linestyle="--", marker="o")

    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("RMSE")
    axes[1].set_title(f"{option_name.capitalize()}: RMSE Convergence")
    axes[1].legend()
    axes[1].grid(True, linestyle=":", alpha=0.6)

    fig.tight_layout()
    
    # Save the figure
    fig.savefig(output_path, bbox_inches="tight")
    print(f"Plot saved successfully to: {output_path}")

if __name__ == "__main__":
    main()
