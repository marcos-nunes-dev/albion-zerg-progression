# Albion Zerg Progression Discord Bot

A clean Discord bot for tracking Albion Online zerg progression, built with Discord.js v14.

## Features

- 🚀 Clean bot structure without pre-built commands
- 📊 Guild and user statistics tracking
- 🔧 Easy to extend with custom commands
- 🛡️ Graceful error handling and shutdown
- 📝 Environment-based configuration

## Prerequisites

- Node.js 16.9.0 or higher
- A Discord application and bot token
- npm or yarn package manager

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd albion-zerg-progression
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your Discord bot credentials:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   BOT_PREFIX=!
   NODE_ENV=development
   ```

4. **Get Discord Bot Credentials**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to the "Bot" section and create a bot
   - Copy the bot token to `DISCORD_TOKEN`
   - Copy the application ID to `CLIENT_ID`
   - Optionally, copy your server ID to `GUILD_ID` for faster development

5. **Invite the bot to your server**
   - Go to the "OAuth2" > "URL Generator" section
   - Select "bot" and "applications.commands" scopes
   - Select necessary permissions (Send Messages, Read Message History, etc.)
   - Use the generated URL to invite the bot

## Running the Bot

### Development Mode
```bash
npm run dev
```
Uses nodemon for automatic restarts on file changes.

### Production Mode
```bash
npm start
```

### Deploy Commands (when you add slash commands)
```bash
npm run deploy
```

## Project Structure

```
albion-zerg-progression/
├── src/
│   ├── index.js              # Main bot entry point
│   └── deploy-commands.js    # Slash command deployment
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## Adding Commands

This bot is intentionally clean without pre-built commands. To add commands:

1. Create a `commands` directory in `src/`
2. Add your command files
3. Update `src/index.js` to load and handle commands
4. Use `npm run deploy` to register slash commands

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, please open an issue in the GitHub repository.
