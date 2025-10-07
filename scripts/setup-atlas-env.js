#!/usr/bin/env node

/**
 * MongoDB Atlas Environment Setup Script
 * This script helps configure environment variables for MongoDB Atlas
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ENV_PATH = path.join(__dirname, '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '.env.example');

console.log('🚀 MongoDB Atlas Environment Setup');
console.log('=====================================\n');

// Check if .env already exists
if (fs.existsSync(ENV_PATH)) {
  console.log('⚠️  .env file already exists!');
  rl.question('Do you want to update it? (y/N): ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      setupEnvironment();
    } else {
      console.log('Setup cancelled.');
      rl.close();
    }
  });
} else {
  setupEnvironment();
}

function setupEnvironment() {
  console.log('\n📝 Please provide your MongoDB Atlas details:\n');
  
  const envVars = {};
  
  // Read existing .env.example as template
  let envTemplate = '';
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    envTemplate = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  }
  
  promptForInput('MongoDB Atlas Username', (username) => {
    promptForInput('MongoDB Atlas Password', (password) => {
      promptForInput('MongoDB Atlas Cluster URL (without mongodb+srv://)', (clusterUrl) => {
        promptForInput('Database Name (default: local-treasures)', (dbName) => {
          promptForInput('JWT Secret (leave empty to generate)', (jwtSecret) => {
            
            // Set defaults
            dbName = dbName || 'local-treasures';
            jwtSecret = jwtSecret || generateJWTSecret();
            
            // Build MongoDB URI
            const mongoUri = `mongodb+srv://${username}:${encodeURIComponent(password)}@${clusterUrl}/${dbName}?retryWrites=true&w=majority`;
            
            // Update environment template
            let envContent = envTemplate;
            envContent = envContent.replace(
              /MONGODB_URI=.*/,
              `MONGODB_URI=${mongoUri}`
            );
            envContent = envContent.replace(
              /DB_NAME=.*/,
              `DB_NAME=${dbName}`
            );
            envContent = envContent.replace(
              /JWT_SECRET=.*/,
              `JWT_SECRET=${jwtSecret}`
            );
            
            // Write .env file
            fs.writeFileSync(ENV_PATH, envContent);
            
            console.log('\n✅ Environment file created successfully!');
            console.log('📁 File location:', ENV_PATH);
            console.log('\n🔐 Your MongoDB URI (password hidden):');
            console.log(mongoUri.replace(/:([^:@]+)@/, ':***@'));
            console.log('\n🚀 You can now start your server with: npm run dev');
            console.log('\n📖 For detailed setup instructions, see: MONGODB_ATLAS_SETUP.md');
            
            rl.close();
          });
        });
      });
    });
  });
}

function promptForInput(prompt, callback) {
  rl.question(`${prompt}: `, callback);
}

function generateJWTSecret() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n\n❌ Setup cancelled by user.');
  process.exit(0);
});