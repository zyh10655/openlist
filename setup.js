const fs = require('fs').promises;
const path = require('path');

// Try to load markdown-pdf if available
let markdownpdf;
try {
    markdownpdf = require('markdown-pdf');
} catch (e) {
    console.log('Note: markdown-pdf not installed. PDFs will not be generated.');
    console.log('Run "npm install markdown-pdf" to enable PDF generation.');
}

// Function to convert markdown to PDF
async function convertMdToPdf(mdPath, pdfPath) {
    if (!markdownpdf) return false;
    
    return new Promise((resolve, reject) => {
        markdownpdf()
            .from(mdPath)
            .to(pdfPath, function (err) {
                if (err) reject(err);
                else resolve(true);
            });
    });
}

// Sample checklist content generator
function generateChecklistContent(title, version) {
    return `# ${title}

Version: ${version}
License: CC BY 4.0 - Free to use, modify, and share

## Table of Contents
1. [Introduction](#introduction)
2. [Pre-Launch Checklist](#pre-launch)
3. [Legal Requirements](#legal)
4. [Operations Setup](#operations)
5. [Marketing & Launch](#marketing)
6. [Post-Launch](#post-launch)
7. [Resources](#resources)

## Introduction

This comprehensive checklist will guide you through every step of launching your ${title.toLowerCase()}. Each section includes detailed sub-tasks, tips, and common pitfalls to avoid.

## Pre-Launch Checklist

### Market Research
- [ ] Define your unique value proposition
- [ ] Identify target customer demographics
- [ ] Analyze competitor offerings and pricing
- [ ] Conduct customer interviews (minimum 20)
- [ ] Validate demand through surveys or pre-orders
- [ ] Research industry trends and forecasts

### Business Planning
- [ ] Create detailed business plan
- [ ] Develop financial projections (3-year minimum)
- [ ] Set SMART goals for first year
- [ ] Identify key performance indicators (KPIs)
- [ ] Create contingency plans for common scenarios
- [ ] Define exit strategy

### Funding
- [ ] Calculate total startup costs
- [ ] Identify funding sources
- [ ] Prepare loan/investment documentation
- [ ] Apply for grants if applicable
- [ ] Set up financial tracking systems
- [ ] Create cash flow projections

## Legal Requirements

### Business Structure
- [ ] Choose business entity type (LLC, Corp, etc.)
- [ ] Register business name
- [ ] Obtain EIN from IRS
- [ ] Register for state and local taxes
- [ ] Set up business bank accounts
- [ ] Get business credit card

### Licenses & Permits
- [ ] Research required licenses for your area
- [ ] Apply for business license
- [ ] Obtain industry-specific permits
- [ ] Register for sales tax permit
- [ ] Check zoning requirements
- [ ] File DBA if using different name

### Insurance & Legal
- [ ] Get general liability insurance
- [ ] Obtain professional liability if needed
- [ ] Consider property insurance
- [ ] Review workers' comp requirements
- [ ] Create/review contracts and agreements
- [ ] Establish privacy policy and terms

## Operations Setup

### Location & Equipment
- [ ] Secure business location
- [ ] Negotiate lease terms
- [ ] Plan layout and design
- [ ] Purchase necessary equipment
- [ ] Set up utilities
- [ ] Install security systems

### Suppliers & Inventory
- [ ] Research potential suppliers
- [ ] Request quotes and samples
- [ ] Negotiate terms and pricing
- [ ] Set up vendor accounts
- [ ] Create inventory management system
- [ ] Establish reorder points

### Systems & Processes
- [ ] Create standard operating procedures
- [ ] Set up accounting system
- [ ] Implement customer management system
- [ ] Establish quality control processes
- [ ] Create employee handbook
- [ ] Set up communication systems

## Marketing & Launch

### Brand Development
- [ ] Create brand identity
- [ ] Design logo and brand assets
- [ ] Develop brand voice and messaging
- [ ] Create style guide
- [ ] Register trademarks if needed
- [ ] Order business cards and materials

### Online Presence
- [ ] Register domain name
- [ ] Build website
- [ ] Set up Google My Business
- [ ] Create social media profiles
- [ ] Implement SEO strategies
- [ ] Set up email marketing

### Launch Strategy
- [ ] Plan grand opening event
- [ ] Create promotional materials
- [ ] Develop pricing strategy
- [ ] Plan initial marketing campaigns
- [ ] Reach out to media contacts
- [ ] Schedule social media content

## Post-Launch

### First Month
- [ ] Monitor daily operations closely
- [ ] Gather customer feedback
- [ ] Track KPIs daily
- [ ] Adjust processes as needed
- [ ] Address issues immediately
- [ ] Celebrate small wins

### Ongoing Success
- [ ] Review financials weekly
- [ ] Conduct monthly performance reviews
- [ ] Update marketing strategies
- [ ] Maintain customer relationships
- [ ] Continue professional development
- [ ] Plan for growth and scaling

## Resources

### Helpful Links
- Small Business Administration (SBA)
- SCORE Mentorship
- Industry associations
- Local business development centers

### Templates Included
- Business plan template
- Financial projection spreadsheet
- Marketing calendar
- Operations checklist
- Employee handbook outline

### Community Support
Join our community forum to:
- Ask questions
- Share experiences
- Get feedback
- Find accountability partners
- Access exclusive resources

---

**Remember:** This checklist is a living document. Customize it for your specific needs and circumstances. Success comes from taking action, learning, and adapting.

**Need Help?** Visit our community forum at openchecklist.org/community

**Version History:**
- ${version} - Current version
- Previous versions available in archive

**Contributors:** Thank you to all ${Math.floor(Math.random() * 20) + 5} contributors who helped create this checklist!

*This checklist is provided under Creative Commons BY 4.0 license. You are free to use, modify, and share.*`;
}

async function setup() {
    try {
        // Create directories
        console.log('Creating directories...');
        await fs.mkdir(path.join(__dirname, 'checklists'), { recursive: true });
        await fs.mkdir(path.join(__dirname, 'public'), { recursive: true });

        // Copy HTML file to public directory
        console.log('Setting up public files...');
        
        // Create a simple redirect HTML that points to the actual index.html
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>OpenChecklist Setup</title>
</head>
<body>
    <h1>OpenChecklist Setup Complete!</h1>
    <p>The setup script has run successfully.</p>
    <p><strong>Important:</strong> You need to manually copy your full HTML file to the public/index.html location.</p>
    <p>The placeholder file has been created at: public/index.html</p>
    <br>
    <p>To complete setup:</p>
    <ol>
        <li>Copy your full HTML content (with all the disclaimers) to <code>public/index.html</code></li>
        <li>Restart the server with <code>npm start</code></li>
        <li>Visit <a href="http://localhost:3000">http://localhost:3000</a></li>
    </ol>
</body>
</html>`;
        
        await fs.writeFile(path.join(__dirname, 'public', 'index.html'), htmlContent);

        // Create sample checklist files
        console.log('Creating sample checklist files...');
        
        const checklists = [
            { name: 'food-truck-checklist-v2.1', title: 'Food Truck Business Checklist', version: '2.1' },
            { name: 'therapy-practice-checklist-v1.8', title: 'Therapy Practice Checklist', version: '1.8' },
            { name: 'podcast-workflow-v3.0', title: 'Podcast Production Workflow', version: '3.0' },
            { name: 'retail-shop-checklist-v1.5', title: 'Specialty Retail Shop Checklist', version: '1.5' },
            { name: 'designer-toolkit-v2.5', title: 'Freelance Designer Toolkit', version: '2.5' },
            { name: 'course-creation-v4.0', title: 'Online Course Creation Checklist', version: '4.0' }
        ];

        for (const checklist of checklists) {
            const content = generateChecklistContent(checklist.title, checklist.version);
            
            // Create markdown version
            await fs.writeFile(
                path.join(__dirname, 'checklists', `${checklist.name}.md`),
                content
            );
            
            // Create PDF version if markdown-pdf is available
            if (markdownpdf) {
                try {
                    await convertMdToPdf(
                        path.join(__dirname, 'checklists', `${checklist.name}.md`),
                        path.join(__dirname, 'checklists', `${checklist.name}.pdf`)
                    );
                    console.log(`✓ Created ${checklist.name} (MD + PDF)`);
                } catch (err) {
                    console.log(`✓ Created ${checklist.name}.md (PDF generation failed)`);
                }
            } else {
                // Create placeholder PDF
                await fs.writeFile(
                    path.join(__dirname, 'checklists', `${checklist.name}.pdf`),
                    `PDF version of ${checklist.title}\n\nThis is a placeholder. Install markdown-pdf to generate real PDFs.`
                );
                console.log(`✓ Created ${checklist.name} (MD + placeholder PDF)`);
            }
        }

        console.log('\n✅ Setup complete!');
        console.log('\nNext steps:');
        console.log('1. Copy the updated HTML content to public/index.html');
        console.log('2. Run "npm install" to install dependencies');
        console.log('3. Run "npm start" to start the server');
        console.log('4. Visit http://localhost:3000 to see your site');
        
    } catch (error) {
        console.error('Setup failed:', error);
    }
}

setup();