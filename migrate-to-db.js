// migrate-to-db.js
const { initializeDatabase, createChecklist } = require('./database');
const fs = require('fs').promises;
const path = require('path');

// Sample checklist data to import
const checklistsData = [
    {
        title: "Food Truck Business Checklist",
        description: "Complete guide to launching your food truck from concept to first sale",
        icon: "🚚",
        category: "Food & Beverage",
        content: "Full comprehensive guide for starting a food truck business...",
        features: [
            "150+ step checklist",
            "Permit templates",
            "Menu planning tools",
            "Supplier directory"
        ],
        items: [
            // Planning Phase
            { phase: "Planning and Research", text: "Define your concept and unique value proposition", required: true },
            { phase: "Planning and Research", text: "Research target market and competition", required: true },
            { phase: "Planning and Research", text: "Create business plan and financial projections", required: true },
            { phase: "Planning and Research", text: "Identify startup costs and funding sources", required: true },
            { phase: "Planning and Research", text: "Research local food truck regulations", required: true },
            { phase: "Planning and Research", text: "Scout potential locations and events", required: true },
            
            // Legal Phase
            { phase: "Legal and Regulatory", text: "Choose business structure (LLC, Corporation, etc.)", required: true },
            { phase: "Legal and Regulatory", text: "Register business name and obtain EIN", required: true },
            { phase: "Legal and Regulatory", text: "Apply for business license", required: true },
            { phase: "Legal and Regulatory", text: "Obtain food handler's permit", required: true },
            { phase: "Legal and Regulatory", text: "Get health department permits", required: true },
            { phase: "Legal and Regulatory", text: "Secure parking permits", required: true },
            { phase: "Legal and Regulatory", text: "Obtain commercial vehicle insurance", required: true },
            
            // Equipment Phase
            { phase: "Equipment and Setup", text: "Purchase or lease food truck", required: true },
            { phase: "Equipment and Setup", text: "Install kitchen equipment", required: true },
            { phase: "Equipment and Setup", text: "Set up POS system", required: true },
            { phase: "Equipment and Setup", text: "Design and install signage/wrap", required: true },
            { phase: "Equipment and Setup", text: "Stock initial inventory", required: true },
            
            // Launch Phase
            { phase: "Marketing and Launch", text: "Create social media accounts", required: true },
            { phase: "Marketing and Launch", text: "Design menu and pricing", required: true },
            { phase: "Marketing and Launch", text: "Plan grand opening event", required: false },
            { phase: "Marketing and Launch", text: "Set up online ordering system", required: false },
            { phase: "Marketing and Launch", text: "Launch marketing campaign", required: true }
        ]
    },
    {
        title: "Therapy Practice Checklist",
        description: "Step-by-step guide to starting your independent therapy practice",
        icon: "🧠",
        category: "Healthcare",
        content: "Comprehensive guide for mental health professionals starting their practice...",
        features: [
            "200+ step checklist",
            "Insurance forms",
            "Client intake templates",
            "HIPAA compliance guide"
        ],
        items: [
            { phase: "Education and Licensing", text: "Complete required education and training", required: true },
            { phase: "Education and Licensing", text: "Pass licensing examinations", required: true },
            { phase: "Education and Licensing", text: "Apply for state license", required: true },
            { phase: "Education and Licensing", text: "Obtain malpractice insurance", required: true },
            
            { phase: "Business Setup", text: "Choose business structure", required: true },
            { phase: "Business Setup", text: "Register business name", required: true },
            { phase: "Business Setup", text: "Open business bank account", required: true },
            { phase: "Business Setup", text: "Set up accounting system", required: true },
            
            { phase: "Office and Systems", text: "Find and lease office space", required: true },
            { phase: "Office and Systems", text: "Set up HIPAA-compliant systems", required: true },
            { phase: "Office and Systems", text: "Create client intake forms", required: true },
            { phase: "Office and Systems", text: "Establish billing procedures", required: true }
        ]
    },
    {
        title: "Podcast Production Workflow",
        description: "Professional podcast setup and production system",
        icon: "🎙️",
        category: "Media & Entertainment",
        content: "Everything you need to launch and produce a professional podcast...",
        features: [
            "Equipment checklist",
            "Recording templates",
            "Editing workflow",
            "Distribution guide"
        ],
        items: [
            { phase: "Planning", text: "Define podcast concept and target audience", required: true },
            { phase: "Planning", text: "Choose podcast name and format", required: true },
            { phase: "Planning", text: "Create content calendar", required: true },
            
            { phase: "Equipment Setup", text: "Purchase microphone and audio interface", required: true },
            { phase: "Equipment Setup", text: "Set up recording software", required: true },
            { phase: "Equipment Setup", text: "Create recording space", required: true },
            
            { phase: "Production", text: "Record intro and outro", required: true },
            { phase: "Production", text: "Develop episode template", required: true },
            { phase: "Production", text: "Establish editing workflow", required: true },
            
            { phase: "Distribution", text: "Choose podcast hosting platform", required: true },
            { phase: "Distribution", text: "Submit to Apple Podcasts", required: true },
            { phase: "Distribution", text: "Submit to Spotify", required: true },
            { phase: "Distribution", text: "Create podcast website", required: false }
        ]
    },
    {
        title: "Specialty Retail Shop Package",
        description: "Everything you need to open your boutique retail store",
        icon: "🏪",
        category: "Retail",
        content: "Complete guide for opening a specialty retail store...",
        features: [
            "175+ step checklist",
            "Inventory templates",
            "POS setup guide",
            "Marketing calendar"
        ],
        items: [
            { phase: "Market Research", text: "Analyze local market demand", required: true },
            { phase: "Market Research", text: "Research competitors", required: true },
            { phase: "Market Research", text: "Define target customer profile", required: true },
            
            { phase: "Location and Setup", text: "Find retail location", required: true },
            { phase: "Location and Setup", text: "Negotiate lease terms", required: true },
            { phase: "Location and Setup", text: "Design store layout", required: true },
            { phase: "Location and Setup", text: "Install fixtures and displays", required: true },
            
            { phase: "Inventory", text: "Source suppliers", required: true },
            { phase: "Inventory", text: "Set up vendor accounts", required: true },
            { phase: "Inventory", text: "Create inventory management system", required: true },
            { phase: "Inventory", text: "Order initial stock", required: true }
        ]
    },
    {
        title: "Freelance Designer Toolkit",
        description: "Complete system for launching and managing your design business",
        icon: "🎨",
        category: "Creative Services",
        content: "Everything you need to succeed as a freelance designer...",
        features: [
            "Client onboarding process",
            "Contract templates",
            "Pricing calculator",
            "Portfolio guidelines"
        ],
        items: [
            { phase: "Business Foundation", text: "Define service offerings", required: true },
            { phase: "Business Foundation", text: "Set pricing structure", required: true },
            { phase: "Business Foundation", text: "Create contract templates", required: true },
            
            { phase: "Portfolio Development", text: "Select best work samples", required: true },
            { phase: "Portfolio Development", text: "Create online portfolio", required: true },
            { phase: "Portfolio Development", text: "Write case studies", required: false },
            
            { phase: "Client Management", text: "Develop onboarding process", required: true },
            { phase: "Client Management", text: "Create project management system", required: true },
            { phase: "Client Management", text: "Set up invoicing system", required: true }
        ]
    },
    {
        title: "Online Course Creation",
        description: "Build and launch your online course from scratch",
        icon: "📚",
        category: "Education",
        content: "Step-by-step guide to creating and selling online courses...",
        features: [
            "Course planning framework",
            "Video production checklist",
            "Marketing templates",
            "Student engagement tools"
        ],
        items: [
            { phase: "Course Planning", text: "Validate course topic demand", required: true },
            { phase: "Course Planning", text: "Define learning objectives", required: true },
            { phase: "Course Planning", text: "Create course outline", required: true },
            
            { phase: "Content Creation", text: "Write course scripts", required: true },
            { phase: "Content Creation", text: "Record video lessons", required: true },
            { phase: "Content Creation", text: "Create supplementary materials", required: true },
            
            { phase: "Platform Setup", text: "Choose course platform", required: true },
            { phase: "Platform Setup", text: "Upload course content", required: true },
            { phase: "Platform Setup", text: "Set pricing and access", required: true },
            
            { phase: "Launch", text: "Create sales page", required: true },
            { phase: "Launch", text: "Plan launch campaign", required: true },
            { phase: "Launch", text: "Set up email automation", required: false }
        ]
    }
];

async function migrateToDatabase() {
    try {
        console.log('Initializing database...');
        await initializeDatabase();
        
        console.log('Importing checklists...');
        
        for (const checklist of checklistsData) {
            try {
                const id = await createChecklist(checklist);
                console.log(`✓ Imported: ${checklist.title} (ID: ${id})`);
                
                // Also import any existing markdown files
                const mdFile = `${checklist.title.toLowerCase().replace(/\s+/g, '-')}.md`;
                const mdPath = path.join(__dirname, 'checklists', mdFile);
                
                try {
                    const mdContent = await fs.readFile(mdPath, 'utf8');
                    // You could update the content field with the actual markdown
                    console.log(`  - Found existing markdown file: ${mdFile}`);
                } catch (err) {
                    // File doesn't exist, that's okay
                }
                
            } catch (err) {
                console.error(`✗ Failed to import ${checklist.title}:`, err.message);
            }
        }
        
        console.log('\nMigration complete!');
        process.exit(0);
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateToDatabase();