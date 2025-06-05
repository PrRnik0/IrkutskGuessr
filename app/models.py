# models.py (updated)
from app import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
import random
import string
from sqlalchemy import inspect

def generate_set_code(length=6):
    """Generate a random set code with mixed case letters and digits"""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))


location_set_association = db.Table('location_set_association',
    db.Column('location_id', db.Integer, db.ForeignKey('location.id'), primary_key=True),
    db.Column('set_id', db.Integer, db.ForeignKey('set.id'), primary_key=True)
)


class Set(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(6), unique=True, nullable=False, default=generate_set_code)
    is_protected = db.Column(db.Boolean, default=False)
    is_public = db.Column(db.Boolean, default=False)
    competition_count = db.Column(db.Integer, default=0)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    max_attempts = db.Column(db.Integer, default=3)
    locations = db.relationship('Location', secondary=location_set_association, 
                              backref=db.backref('sets', lazy='dynamic'))

    creator = db.relationship('User', backref='created_sets')

    @staticmethod
    def create_initial_set():
        inspector = inspect(db.engine)
        if 'set' not in inspector.get_table_names():
            print("Таблица 'set' ещё не создана.")
            return
        initial_set = Set.query.filter_by(code='aaaaaa').first()
        if not initial_set:
            initial_set = Set(
                name='Initial Set',
                code='aaaaaa',
                is_protected=True,
                is_public=True,
                competition_count=5,
                max_attempts=3
            )
            db.session.add(initial_set)
            db.session.commit()

class Location(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    image_filename = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    is_private = db.Column(db.Boolean, default=False)
    creator = db.relationship('User', backref='created_locations')

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)  # Добавлен unique=True
    password_hash = db.Column(db.String(128))
    role = db.Column(db.String(20), default='user')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reset_token = db.Column(db.String(100))
    reset_token_expires = db.Column(db.DateTime)
    reset_code = db.Column(db.String(6))
    reset_code_expires = db.Column(db.DateTime)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    @classmethod
    def is_database_empty(cls):
        return cls.query.count() == 0
    
class CompetitionResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    set_id = db.Column(db.Integer, db.ForeignKey('set.id'), nullable=False)
    score = db.Column(db.Integer, default=0)
    duration_seconds = db.Column(db.Float, default=0.0) 
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    attempts = db.Column(db.Integer, default=0)