import os
from flask import Flask
from .database import init_db, close_db


def create_app():
    app = Flask(__name__, static_folder='static', static_url_path='/static')
    app.config['DATABASE'] = os.environ.get('DATABASE_PATH', '/data/waterbills.db')

    # Session signing + admin credentials (override via environment in production)
    app.secret_key = os.environ.get('SECRET_KEY', 'mathru-nilaya-dev-secret')
    app.config['ADMIN_USER'] = os.environ.get('ADMIN_USER', 'admin')
    app.config['ADMIN_PASSWORD'] = os.environ.get('ADMIN_PASSWORD', 'pastword')

    with app.app_context():
        init_db()

    app.teardown_appcontext(close_db)

    from .routes import bp
    app.register_blueprint(bp)

    return app
