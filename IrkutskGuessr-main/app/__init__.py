from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config
from flask_login import LoginManager

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Инициализация БД
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Регистрация blueprints
    from app.routes import bp as main_bp
    app.register_blueprint(main_bp)

    # Import models here to avoid circular imports
    from app.models import User

    # Setup user loader
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    return app

