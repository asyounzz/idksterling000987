const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Your bot info
const clientId = '1350990854185156751';
const token = process.env.BOTTOKEN;

if (!token) {
  console.error('❌ BOTTOKEN environment variable is missing.');
  process.exit(1);
}

const commands = [];

// Load all .js files in /commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if (command?.data) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[WARNING] Skipped ${file} — missing "data" or invalid format.`);
  }
}

// Deploy
const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`🔄 Refreshing ${commands.length} application (/) commands...`);

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('✅ Successfully deployed commands.');
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
})();