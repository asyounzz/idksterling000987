const { REST, Routes } = require('discord.js');

// Your bot info
const clientId = '1353415772931752067';
const token = process.env.BOTTOKEN;

if (!token) {
  console.error('❌ BOTTOKEN environment variable is missing.');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`🗑️ Deleting all global application (/) commands...`);

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }, // empty array deletes all commands
    );

    console.log('✅ Successfully deleted all commands.');
  } catch (error) {
    console.error('❌ Failed to delete commands:', error);
  }
})();