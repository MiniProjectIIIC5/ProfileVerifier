import os
import pandas as pd
import numpy as np
import kagglehub
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


# =========================
# DOWNLOAD DATASET
# =========================

def download_dataset():
    print("Downloading Kaggle dataset...")
    path = kagglehub.dataset_download(
        "whoseaspects/genuinefake-user-profile-dataset"
    )
    print("Dataset path:", path)
    return path


# =========================
# LOAD DATA
# =========================

def load_dataset(path):
    for file in os.listdir(path):
        if file.endswith(".csv"):
            return pd.read_csv(
                os.path.join(path, file),
                engine="python",
                sep=",",
                encoding="latin1",
                on_bad_lines="skip"
            )
    raise FileNotFoundError("CSV file not found")


# =========================
# PREPARE DATA
# =========================

def prepare_data():
    path = download_dataset()
    df = load_dataset(path)

    # Normalize column names
    df.columns = df.columns.str.lower()

    # Convert target
    df["label"] = df["dataset"].apply(
        lambda x: 1 if str(x).lower() == "fake" else 0
    )

    # Feature engineering
    df["username_length"] = df["screen_name"].astype(str).apply(len)
    df["has_profile_pic"] = df["profile_image_url_https"].notnull().astype(int)

    feature_columns = [
        "followers_count",
        "friends_count",
        "statuses_count",
        "favourites_count",
        "listed_count",
        "username_length",
        "has_profile_pic",
        "protected",
        "verified"
    ]

    df = df[feature_columns + ["label"]]
    df.fillna(0, inplace=True)

    X = df[feature_columns]
    y = df["label"]

    return X, y


# =========================
# TRAIN MODEL
# =========================

def ml_model():
    X, y = prepare_data()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=15,
        random_state=42,
        class_weight="balanced"
    )

    model.fit(X_train_scaled, y_train)

    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)

    print("\n✅ MODEL TRAINED SUCCESSFULLY")
    print(f"🎯 Accuracy: {accuracy * 100 :.2f}%")

    joblib.dump(model, "model.pkl")
    joblib.dump(scaler, "scaler.pkl")

    print("💾 model.pkl and scaler.pkl saved")


# =========================
# MAIN
# =========================

if __name__ == "__main__":
    ml_model()
