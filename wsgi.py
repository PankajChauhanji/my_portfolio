"""Production entry point: gunicorn wsgi:application"""
from app import create_app

application = create_app()

if __name__ == "__main__":
    application.run()
