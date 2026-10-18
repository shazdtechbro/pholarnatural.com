from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# The database engine
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, hide_parameters=True)

# A configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# A Base class for our models to inherit from
Base = declarative_base()
