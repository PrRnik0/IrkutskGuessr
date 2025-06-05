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
    MAIL_SERVER = 'smtp.mail.ru'
    MAIL_PORT = 465
    MAIL_USE_SSL = True
    MAIL_USERNAME = 'dokimita@mail.ru'
    MAIL_PASSWORD = 'KfeCNR2vJpRadqdolWde'
    MAIL_DEFAULT_SENDER = 'dokimita@mail.ru'