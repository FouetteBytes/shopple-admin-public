#!/usr/bin/env python3
"""
Firebase Storage Setup Script for Product Classifier Crawler
Installs required dependencies and sets up Firebase Storage integration
"""

import os
import sys
import subprocess
import json
from pathlib import Path

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

def run_command(command, description):
    """Run a command and handle errors"""
    print(f" {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        logger.info(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ {description} failed:")
        logger.debug(f"   Error: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        logger.error("❌ Python 3.8 or higher is required")
        logger.debug(f"   Current version: {sys.version}")
        return False
    logger.info(f"✅ Python version check passed: {sys.version}")
    return True

def install_firebase_dependencies():
    """Install Firebase Storage dependencies"""
    requirements = [
        "firebase-admin>=6.4.0",
        "google-cloud-storage>=2.10.0",
        "python-dotenv>=1.0.0"
    ]
    
    logger.info(" Installing Firebase Storage dependencies...")
    for req in requirements:
        if not run_command(f"pip install {req}", f"Installing {req}"):
            return False
    return True

def create_env_template():
    """Create environment template file"""
    env_template = """# Firebase Storage Configuration for Crawler
# Copy these values from your Firebase project settings

# Firebase Project Configuration
FIREBASE_PROJECT_ID=shopple-7a67b
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@shopple-7a67b.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...your-private-key...\\n-----END PRIVATE KEY-----\\n"

# Firebase Storage Bucket
FIREBASE_STORAGE_BUCKET=shopple-7a67b.firebasestorage.app

# Optional: Custom configuration
CRAWLER_STORAGE_MODE=both  # local, firebase, both
CRAWLER_AUTO_UPLOAD=true
CRAWLER_KEEP_LOCAL_DAYS=7
CRAWLER_MAX_LOCAL_FILES=50
"""
    
    env_file = Path(__file__).parent / ".env.crawler"
    
    try:
        with open(env_file, 'w') as f:
            f.write(env_template)
        logger.info(f"✅ Environment template created: {env_file}")
        print("    Please update the Firebase configuration values")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create environment template: {e}")
        return False

def test_firebase_connection():
    """Test Firebase connection"""
    logger.info(" Testing Firebase Storage connection...")
    
    test_script = '''
import os
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    env_file = Path(__file__).parent / ".env.crawler"
    if env_file.exists():
        load_dotenv(env_file)
    else:
        logger.warning("⚠️  .env.crawler file not found")
except ImportError:
    logger.warning("⚠️  python-dotenv not installed")

# Test Firebase initialization
try:
    import firebase_admin
    from firebase_admin import credentials, storage
    
    # Check if required environment variables exist
    required_vars = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        logger.error(f"❌ Missing environment variables: {missing_vars}")
        print("   Please update .env.crawler with your Firebase configuration")
        exit(1)
    
    # Initialize Firebase (if not already initialized)
    if not firebase_admin._apps:
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": os.getenv('FIREBASE_PROJECT_ID'),
            "client_email": os.getenv('FIREBASE_CLIENT_EMAIL'),
            "private_key": os.getenv('FIREBASE_PRIVATE_KEY').replace('\\\\n', '\\n'),
        })
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
        })
    
    # Test storage bucket access
    bucket = storage.bucket()
    logger.info(f"✅ Successfully connected to Firebase Storage: {bucket.name}")
    logger.info(" Firebase Storage setup is complete!")
    
except Exception as e:
    logger.error(f"❌ Firebase connection test failed: {e}")
    print("   Please check your Firebase configuration in .env.crawler")
    exit(1)
'''
    
    test_file = Path(__file__).parent / "test_firebase_connection.py"
    
    try:
        with open(test_file, 'w') as f:
            f.write(test_script)
        
        result = subprocess.run([sys.executable, str(test_file)], 
                              capture_output=True, text=True, cwd=Path(__file__).parent)
        
        print(result.stdout)
        if result.stderr:
            print(result.stderr)
        
        # Clean up test file
        test_file.unlink()
        
        return result.returncode == 0
        
    except Exception as e:
        logger.error(f"❌ Firebase connection test failed: {e}")
        return False

def setup_storage_directories():
    """Create necessary storage directories"""
    base_dir = Path(__file__).parent
    directories = [
        base_dir / "output" / "keells",
        base_dir / "output" / "cargills",
        base_dir / "storage_backup",
        base_dir / "logs"
    ]
    
    for directory in directories:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            logger.info(f"✅ Created directory: {directory}")
        except Exception as e:
            logger.error(f"❌ Failed to create directory {directory}: {e}")
            return False
    
    return True

def create_storage_config():
    """Create default storage configuration"""
    config = {
        "storage_mode": "both",
        "auto_upload": True,
        "keep_local_days": 7,
        "max_local_files": 50,
        "auto_cleanup": True,
        "firebase_enabled": True,
        "setup_date": "2025-07-04",
        "version": "1.0.0"
    }
    
    config_file = Path(__file__).parent / "storage_config.json"
    
    try:
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)
        logger.info(f"✅ Storage configuration created: {config_file}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create storage configuration: {e}")
        return False

def main():
    """Main setup function"""
    logger.info(" Firebase Storage Setup for Product Classifier Crawler")
    print("=" * 60)
    
    # Check Python version
    if not check_python_version():
        return False
    
    # Install dependencies
    if not install_firebase_dependencies():
        logger.error("❌ Failed to install Firebase dependencies")
        return False
    
    # Create directories
    if not setup_storage_directories():
        logger.error("❌ Failed to setup storage directories")
        return False
    
    # Create environment template
    if not create_env_template():
        logger.error("❌ Failed to create environment template")
        return False
    
    # Create storage configuration
    if not create_storage_config():
        logger.error("❌ Failed to create storage configuration")
        return False
    
    print("\n" + "=" * 60)
    logger.info("✅ Firebase Storage setup completed successfully!")
    print("\n Next Steps:")
    print("1. Update .env.crawler with your Firebase configuration")
    print("2. Run: python test_firebase_connection.py")
    print("3. Start using the enhanced crawler manager")
    print("\n Usage:")
    print("   from enhanced_crawler_manager import get_enhanced_crawler_manager")
    print("   manager = get_enhanced_crawler_manager(use_firebase=True)")
    print("   result = manager.run_crawler_with_storage('keells', 'vegetables')")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
