#!/bin/bash
# ================================================================
# EA DiGiFolk Backup Script for pelinhx
# ================================================================
# This script creates a complete backup of the ea-digifolk-vis project
# and pushes it to your eadigibackup GitHub repository.
# ================================================================

# ---- CONFIGURATION ----
# Full path to your project directory
SOURCE_DIR="/Users/pelinho/Desktop/Projeto Tese/Website Project/ea-digifolk-vis"

# Full path to the backup directory
BACKUP_DIR="/Users/pelinho/Desktop/Projeto Tese/Website Project/eadigibackup"

# Generate a timestamp for this backup
DATE=$(date +"%Y-%m-%d_%H-%M-%S")

# Name for this backup
BACKUP_FOLDER="backup_$DATE"

# GitHub repository URL configured for pelinhx
GITHUB_REPO="https://github.com/pelinhx/eadigibackup.git"

# ---- COLORIZED OUTPUT ----
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---- HELPER FUNCTIONS ----
# Function to print section headers
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}"
}

# Function to print status messages
print_status() {
    echo -e "${YELLOW}$1${NC}"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}$1${NC}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}ERROR: $1${NC}"
}

# Function to check if a command succeeded
check_success() {
    if [ $? -ne 0 ]; then
        print_error "$1"
        exit 1
    fi
}

# ---- MAIN SCRIPT ----
print_header "EA DiGiFolk Backup Process for pelinhx"
print_status "Starting backup on $(date)"
print_status "Source: $SOURCE_DIR"
print_status "Destination: $BACKUP_DIR/$BACKUP_FOLDER"
print_status "GitHub: $GITHUB_REPO"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    print_error "Source directory does not exist at $SOURCE_DIR"
    exit 1
fi

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    print_status "Creating backup directory..."
    mkdir -p "$BACKUP_DIR"
    check_success "Failed to create backup directory"
fi

# Create a backup folder with timestamp
print_status "Creating backup folder..."
mkdir -p "$BACKUP_DIR/$BACKUP_FOLDER"
check_success "Failed to create backup folder"

# Copy files (excluding node_modules, .git, and dist)
print_header "Copying Files"
print_status "This may take a few minutes..."

rsync -av --progress \
      --exclude="node_modules" \
      --exclude=".git" \
      --exclude="dist" \
      "$SOURCE_DIR/" \
      "$BACKUP_DIR/$BACKUP_FOLDER/"
check_success "Failed to copy files"

print_success "Files copied successfully!"

# Initialize git repo in backup directory if it doesn't exist
print_header "Setting Up Git Repository"

if [ ! -d "$BACKUP_DIR/.git" ]; then
    print_status "Initializing git repository in backup directory..."
    cd "$BACKUP_DIR"
    check_success "Failed to change to backup directory"
    
    git init
    check_success "Failed to initialize git repository"
    
    # Create a README file
    cat > README.md << EOF
# EA DiGiFolk Backup

Backup repository for the EA DiGiFolk Visualization website maintained by pelinhx.

Last backup: $DATE

## Repository Contents

This repository contains periodic backups of the EA DiGiFolk project. Each backup is stored in its own folder with a timestamp.

## Latest Backup

The most recent backup can be found in the \`latest_backup\` symbolic link.
EOF
    
    # Create a .gitignore file
    cat > .gitignore << EOF
.DS_Store
node_modules/
.env
.env.local
.env.*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
EOF
    
    git add README.md .gitignore
    git commit -m "Initial repository setup by pelinhx"
    check_success "Failed to commit initial files"
    
    # Ensure GitHub repo is correctly configured
    print_status "Setting up GitHub remote..."
    git remote remove origin 2>/dev/null
    git remote add origin "$GITHUB_REPO"
    check_success "Failed to add GitHub remote"
else
    print_status "Git repository already exists in backup directory"
    cd "$BACKUP_DIR"
    check_success "Failed to change to backup directory"
    
    # Make sure the remote is correctly set
    print_status "Ensuring remote is set correctly..."
    git remote remove origin 2>/dev/null
    git remote add origin "$GITHUB_REPO"
    
    # Update README with latest backup date
    sed -i '' "s/Last backup:.*/Last backup: $DATE/" README.md 2>/dev/null || 
      sed -i "s/Last backup:.*/Last backup: $DATE/" README.md
    git add README.md
    git commit -m "Update backup timestamp"
fi

# Add the backup to git
print_header "Committing Backup"
print_status "Adding backup files to git..."

git add "$BACKUP_FOLDER"
check_success "Failed to add backup files to git"

git commit -m "Backup $DATE - Full project snapshot by pelinhx"
check_success "Failed to commit backup files"

# Push to GitHub
print_header "Pushing to GitHub"
print_status "Uploading backup to pelinhx/eadigibackup repository..."

# Check and display the remote URL
print_status "Verifying remote URL..."
echo "Current remote URL: $(git remote get-url origin)"

# Check if we need GitHub authentication
print_status "Note: If this is your first time pushing to GitHub, you may be prompted for credentials"
print_status "You can use a Personal Access Token if you have 2FA enabled"

# Try to push to main branch
git branch -M main  # This renames your current branch to "main"
if git push -u origin main; then
    print_success "Backup pushed to GitHub (main branch) successfully!"
else
    print_status "Failed to push to main branch. Trying an alternative approach..."
    
    # Alternative approach - use a personal access token if available
    if [ -n "$GITHUB_TOKEN" ]; then
        print_status "Using GitHub token for authentication..."
        # Use token for authentication
        GITHUB_URL_WITH_TOKEN="https://${GITHUB_TOKEN}@github.com/pelinhx/eadigibackup.git"
        git remote set-url origin "$GITHUB_URL_WITH_TOKEN"
        
        if git push -u origin main; then
            print_success "Backup pushed to GitHub using token authentication!"
            # Reset URL to not include token in logs/output
            git remote set-url origin "$GITHUB_REPO"
        else
            print_error "Failed to push even with token authentication."
            # Reset URL
            git remote set-url origin "$GITHUB_REPO"
            exit 1
        fi
    else
        # Try creating a new branch as last resort
        print_status "Trying to push to a new branch..."
        git checkout -b "backup-$DATE"
        if git push -u origin "backup-$DATE"; then
            print_success "Backup pushed to GitHub (backup-$DATE branch) successfully!"
            # Return to main branch
            git checkout main
        else
            print_error "Failed to push to GitHub. Please ensure the repository exists and you have proper credentials."
            exit 1
        fi
    fi
fi

# Create/update a symlink to the latest backup
print_status "Updating latest backup symlink..."
rm -f "$BACKUP_DIR/latest_backup"
ln -s "$BACKUP_FOLDER" "$BACKUP_DIR/latest_backup"

print_header "Backup Complete"
print_success "Backup completed successfully at $(date)"
print_success "Backup stored in: $BACKUP_DIR/$BACKUP_FOLDER"
print_success "Latest backup symlink updated: $BACKUP_DIR/latest_backup"
print_success "Backup has been pushed to your GitHub repository: https://github.com/pelinhx/eadigibackup"