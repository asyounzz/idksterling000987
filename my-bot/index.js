const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const app = express();
const port = process.env.PORT || 4000;

app.get('/', (req, res) => res.send('BombParty Bot is running!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load Slash Commands from /commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] Command ${file} is missing "data" or "execute".`);
    }
  }
}

// Handle Interactions
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Only handle slash commands here
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) {
        await command.execute(interaction, client);
      }
    }
    // Button and other component interactions are handled by collectors within commands
    // No need to handle them globally
  } catch (error) {
    console.error('❌ Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

// On Ready
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'with words n bombs', type: 1 }],
    status: 'online',
  });
});

// Error Handling
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// Login
client.login(process.env.BOTTOKEN);