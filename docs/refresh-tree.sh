#!/bin/bash

rm -rf clippy_structure.md
echo "\`\`\`" > clippy_structure.md
tree ~/Documents/clippy -I 'dist|.*dist.*|zone.js|node_modules|eslint*|nest-cli*angular-devkit' > clippy_structure.md
echo "\`\`\`" > clippy_structure.md
