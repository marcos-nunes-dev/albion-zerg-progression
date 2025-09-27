const { Client, GatewayIntentBits, Events, REST, Routes } = require('discord.js');
const GuildProgressionService = require('./services/guildProgression');
const { commands } = require('./commands');
const { CommandHandlers } = require('./handlers/commandHandlers');
const { ButtonHandlers } = require('./handlers/buttonHandlers');
const cron = require('node-cron');
require('dotenv').config();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize services
let guildProgressionService;
let commandHandlers;
let buttonHandlers;

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Bot is ready! Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    console.log(`👥 Serving ${client.users.cache.size} users`);

    // Initialize services
    guildProgressionService = new GuildProgressionService(client);
    commandHandlers = new CommandHandlers(guildProgressionService);
    buttonHandlers = new ButtonHandlers(guildProgressionService);

    // Deploy commands
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash commands deployed successfully');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }

    // Start cron job for updates every 3 hours
    cron.schedule('0 */3 * * *', async () => {
        console.log('⏰ Running scheduled guild progression update...');
        await guildProgressionService.updateGuildProgression();
    });
    console.log('⏰ Cron job scheduled for guild progression updates every 3 hours');
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        switch (interaction.commandName) {
            case 'update-progression':
                await commandHandlers.handleUpdateProgression(interaction);
                break;
            case 'count-vods':
                await commandHandlers.handleCountVods(interaction);
                break;
            case 'rate':
                await commandHandlers.handleRate(interaction);
                break;
            case 'rating-stats':
                await commandHandlers.handleRatingStats(interaction);
                break;
            case 'player-rates':
                await commandHandlers.handlePlayerRates(interaction);
                break;
            default:
                console.log(`Unknown command: ${interaction.commandName}`);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                flags: 64 // EPHEMERAL
            });
        }
    }
});

// Handle button interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
        await buttonHandlers.handleLeaderboardNavigation(interaction);
    } catch (error) {
        console.error('Error handling button interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                flags: 64 // EPHEMERAL
            });
        }
    }
});

// Handle new messages in threads
client.on(Events.MessageCreate, async message => {
    // Only process messages in threads
    if (!message.channel.isThread()) return;
    
    // Ignore bot messages
    if (message.author.bot) return;
    
    try {
        // Check if this is a player progression thread
        const progressionChannel = await guildProgressionService.findOrCreateProgressionChannel();
        if (message.channel.parentId !== progressionChannel.id) return;
        
        // Check if the message contains a VOD
        const vodPatterns = [
            /youtube\.com\/watch\?v=/i,
            /youtu\.be\//i,
            /medal\.tv\/clips\//i,
            /medal\.tv\/users\/.*\/clips\//i,
            /\.(mp4|mov|avi|mkv|webm)/i
        ];

        let isVod = false;
        let vodType = '';

        // Check message content
        if (message.content) {
            for (const pattern of vodPatterns) {
                if (pattern.test(message.content)) {
                    isVod = true;
                    if (pattern.source.includes('youtube')) {
                        vodType = 'YouTube';
                    } else if (pattern.source.includes('medal')) {
                        vodType = 'Medal.tv';
                    } else {
                        vodType = 'Video';
                    }
                    break;
                }
            }
        }

        // Check attachments
        if (!isVod && message.attachments) {
            for (const attachment of message.attachments.values()) {
                if (attachment.contentType && attachment.contentType.startsWith('video/')) {
                    isVod = true;
                    vodType = 'Video File';
                    break;
                }
            }
        }

        // Check embeds
        if (!isVod && message.embeds) {
            for (const embed of message.embeds) {
                if (embed.url) {
                    for (const pattern of vodPatterns) {
                        if (pattern.test(embed.url)) {
                            isVod = true;
                            if (pattern.source.includes('youtube')) {
                                vodType = 'YouTube';
                            } else if (pattern.source.includes('medal')) {
                                vodType = 'Medal.tv';
                            } else {
                                vodType = 'Video';
                            }
                            break;
                        }
                    }
                }
            }
        }

        if (isVod) {
            // Extract player name from thread title
            const playerName = message.channel.name.split(' ')[0];
            
            console.log(`📹 VOD detected: ${vodType} posted by ${message.author.tag} in ${playerName}'s thread`);
            
            // Update thread title with new VOD count
            await guildProgressionService.updateThreadVodCount(message.channel, playerName);
            
            // Add a reaction to indicate VOD was detected
            await message.react('📹');
            
            // Example: Send a reply (optional)
            // await message.reply(`🎯 ${vodType} VOD detected! Use \`/rate\` to rate this performance.`);
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Gracefully shutting down...');
    client.destroy();
    process.exit(0);
});
