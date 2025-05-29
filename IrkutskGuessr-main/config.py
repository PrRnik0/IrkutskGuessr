import os
from pathlib import Path
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'ваш-секретный-ключ'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(Path(__file__).parent, 'app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.join(Path(__file__).parent, 'app', 'static', 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
    LOGIN_DISABLED = False 
    REMEMBER_COOKIE_DURATION = timedelta(days=30)