import sys
import json
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import pickle
import os
import joblib

# ===== SIMPLE ML MODEL =====

class FakeProfileDetector:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.train_simple_model()
    
    def train_simple_model(self):
        """Train a simple Random Forest model with synthetic data"""
        # Synthetic training data (features that indicate fake profiles)
        # Features: [has_username, has_query_params, url_length, has_special_chars, platform]
        
        X_train = np.array([
            # Real profiles
            [1, 0, 25, 0, 1],  # instagram real
            [1, 0, 30, 0, 1],  # instagram real
            [1, 0, 28, 0, 2],  # linkedin real
            [1, 0, 35, 0, 2],  # linkedin real
            [1, 0, 22, 0, 0],  # other real
            
            # Fake profiles
            [1, 1, 80, 1, 1],  # instagram fake (query params, special chars)
            [1, 1, 95, 1, 1],  # instagram fake
            [0, 0, 10, 1, 2],  # linkedin fake (no username)
            [1, 1, 120, 1, 2], # linkedin fake (very long URL)
            [1, 0, 150, 1, 0], # other fake (very long, special chars)
            [1, 1, 88, 1, 1],  # instagram fake
            [0, 1, 50, 1, 2],  # linkedin fake
        ])
        
        y_train = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1])  # 0=Real, 1=Fake
        
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        
        self.model = RandomForestClassifier(n_estimators=10, max_depth=5, random_state=42)
        self.model.fit(X_train_scaled, y_train)
    
    def predict(self, features_dict):
        """
        Predict if profile is Fake or Real
        
        Args:
            features_dict: {
                'has_username': int,
                'has_query_params': int,
                'url_length': int,
                'has_special_chars': int,
                'platform': int
            }
        
        Returns:
            (prediction_label, confidence)
        """
        try:
            # Convert dict to array
            features_array = np.array([[
                features_dict.get('has_username', 0),
                features_dict.get('has_query_params', 0),
                features_dict.get('url_length', 0),
                features_dict.get('has_special_chars', 0),
                features_dict.get('platform', 0)
            ]])
            
            # Scale features
            features_scaled = self.scaler.transform(features_array)
            
            # Predict
            prediction = self.model.predict(features_scaled)[0]
            confidence = self.model.predict_proba(features_scaled)[0][prediction]
            
            label = 'Fake' if prediction == 1 else 'Real'
            
            return label, float(confidence)
        
        except Exception as e:
            print(f"Error in prediction: {e}", file=sys.stderr)
            return 'Unknown', 0.5


# ===== MAIN EXECUTION =====

if __name__ == '__main__':
    try:
        # Get features from command line argument
        features_json = sys.argv[1]
        features = json.loads(features_json)
        
        # Initialize model
        detector = FakeProfileDetector()
        
        # Make prediction
        prediction, confidence = detector.predict(features)
        
        # Return result as JSON
        result = {
            'prediction': prediction,
            'confidence': confidence
        }
        
        print(json.dumps(result))
        sys.exit(0)
    
    except Exception as e:
        error_result = {
            'prediction': 'Unknown',
            'confidence': 0.5
        }
        print(json.dumps(error_result))
        sys.exit(0)