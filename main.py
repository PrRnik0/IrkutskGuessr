from app import create_app, db
from app.models import Set
app = create_app()


with app.app_context():
    Set.create_initial_set()


if __name__ == "__main__":
    app.run()