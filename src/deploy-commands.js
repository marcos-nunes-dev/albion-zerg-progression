const { REST, Routes } = require('discord.js');
require('dotenv').config();

// This file is for deploying slash commands (when you add them later)
// Currently empty as we're creating a clean bot without commands

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands function (placeholder for future use)
async function deployCommands() {
    try {
        console.log('🚀 Started refreshing application (/) commands.');

        // Currently no commands to deploy
        const commands = [];

        if (process.env.GUILD_ID) {
            // Deploy to specific guild (faster for development)
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            console.log('✅ Successfully reloaded guild application (/) commands.');
        } else {
            // Deploy globally (takes up to 1 hour to propagate)
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
            console.log('✅ Successfully reloaded global application (/) commands.');
        }
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

// Only run if this file is executed directly
if (require.main === module) {
    deployCommands();
}

module.exports = { deployCommands };
