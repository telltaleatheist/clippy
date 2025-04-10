#!/bin/bash

echo "Building Clippy for production..."

# Build frontend
echo "Building frontend..."
cd frontend
npm run build
cd ..

# Build backend
echo "Building backend..."
cd backend
npm run build
cd ..

# Build Electron app
echo "Building Electron app..."
npm run package:mac

echo "Build complete!"
