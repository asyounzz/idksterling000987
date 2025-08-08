const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const app = express();
const port = 4000;

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

// Handle All Interactions in a Unified Way
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Slash command
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction, client);
    }

    // Buttons or modals (handled inside the bombparty command file)
    else {
      const command = client.commands.get('bombparty');
      if (command && command.handleComponent) {
        await command.handleComponent(interaction, client);
      }
    }
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
    activities: [{ name: 'BombParty', type: 3 }],
    status: 'online',
  });
});

// Error Handling
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// Login
client.login(process.env.BOTTOKEN);