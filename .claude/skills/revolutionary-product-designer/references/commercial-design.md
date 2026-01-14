# Commercial Design

Features that drive sales, expansion, and retention through intentional product-led growth.

This is where design becomes business leverage.

## The Core Insight

**SaaS growth isn't about a single killer feature. It's about:**
- Fast activation → more conversions
- Better adoption → more retention  
- Clearer value → easier sales
- Lower support → higher margins
- Expansion paths → higher NRR

Design features that create these outcomes **without being salesy**.

---

## Part I: Value Visibility

Make value tangible. Show ROI. Create shareable moments.

### Pattern 1: Quantified Impact

```jsx
// BAD: Silent value delivery
// User saves time, product doesn't mention it

// GOOD: Value made visible
<div className="impact-card">
  <h3>Your Impact This Month</h3>
  <div className="metrics">
    <Metric 
      label="Hours Saved"
      value="47.3"
      delta="+12% vs last month"
      icon={<ClockIcon />}
    />
    <Metric 
      label="Tasks Completed"
      value="284"
      delta="+18%"
      icon={<CheckCircleIcon />}
    />
    <Metric 
      label="Estimated ROI"
      value="$12,450"
      description="Based on $85/hr avg rate"
      icon={<DollarIcon />}
    />
  </div>
  
  <ShareButton>
    Share your results with your team
  </ShareButton>
</div>
```

**When to Surface:**
- End of first week
- Monthly summaries
- Milestone achievements
- Before renewal/upgrade prompts

**Design Principles:**
- Specific numbers, not vague statements
- Compare to baseline or average
- Translate to business impact (time → money)
- Make shareable

---

### Pattern 2: Progress Indicators

```jsx
// Show advancement toward value
<OnboardingProgress>
  <Step completed>
    ✓ Account created
  </Step>
  <Step completed>
    ✓ First project created
  </Step>
  <Step active>
    → Invite team members
    <small>Teams with 3+ members are 5x more likely to stick around</small>
  </Step>
  <Step>
    Import existing data
  </Step>
  <Step>
    Set up automation
  </Step>
</OnboardingProgress>
```

**Why it Works:**
- Clear path to value
- Social proof ("teams with 3+ members...")
- Gamification psychology
- Reduces drop-off

---

### Pattern 3: Comparative Performance

```jsx
<PerformanceCard>
  <h4>You're crushing it! 🎉</h4>
  <div className="comparison">
    <Bar 
      label="Your team"
      value={87}
      color="green"
    />
    <Bar 
      label="Average team"
      value={52}
      color="gray"
    />
  </div>
  <p>Your team is 67% faster than average</p>
</PerformanceCard>
```

**Psychology:**
- Social comparison drives engagement
- Positive framing builds attachment
- Creates conversation ("Look how fast we are!")
- Implicit retention hook

---

## Part II: Shareable Artifacts

Every share is marketing. Design outputs that spread internally.

### Pattern 4: Beautiful Reports

```jsx
// Export should be presentation-ready
const generateReport = () => {
  return {
    // BRANDED: Company logo, colors
    branding: {
      logo: user.company.logo,
      colors: theme.primary
    },
    
    // EXECUTIVE SUMMARY: One-page overview
    summary: {
      headline: "Q4 2024 Performance Report",
      keyMetrics: [revenue, growth, efficiency],
      insights: topThreeInsights
    },
    
    // VISUAL: Charts > tables
    visualizations: [
      revenueChart,
      growthChart,
      comparativeAnalysis
    ],
    
    // ACTIONABLE: Recommendations
    recommendations: [
      "Increase ad spend in December (+23% ROI)",
      "Focus on enterprise deals (3x ACV)",
      "Expand to EMEA (lowest CAC)"
    ],
    
    // SHAREABLE: PDF + URL
    formats: ['pdf', 'link', 'slides']
  };
};
```

**Design Requirements:**
- No "Exported from [Product]" watermark (tacky)
- Clean, professional design
- Charts are colorblind-safe
- Works in print
- Filename is intelligent ("Q4-2024-Performance-Report.pdf")

**Spread Mechanism:**
- User downloads → Shares with boss → Boss asks "What tool is this?"
- URL link → Stakeholders view → CTAs to sign up
- Slack/Email integration → Team sees → Organic adoption

---

### Pattern 5: Public Profiles

```jsx
// User's work becomes their portfolio
<PublicProfile username={user.handle}>
  <ProfileHeader>
    <Avatar />
    <Name>{user.name}</Name>
    <Bio>{user.bio}</Bio>
    <Stats>
      <Stat label="Projects" value={23} />
      <Stat label="Followers" value={145} />
      <Stat label="Impact" value="2.3k hours saved" />
    </Stats>
  </ProfileHeader>
  
  <ProjectGallery>
    {user.publicProjects.map(project => (
      <ProjectCard 
        title={project.name}
        description={project.description}
        metrics={project.results}
        link={project.url}
      />
    ))}
  </ProjectGallery>
  
  <Footer>
    <PoweredBy>
      Built with [YourProduct]
    </PoweredBy>
    <CTA>Create your own →</CTA>
  </Footer>
</PublicProfile>
```

**Examples:**
- Dribbble (designers showcase work)
- GitHub (developers show code)
- Notion (public templates)
- Loom (shared videos)

**Virality Loop:**
- User creates → Shares profile → Others see → Sign up → Create → Share...

---

## Part III: Expansion Hooks

Guide users from free → paid → expansion.

### Pattern 6: Usage-Based Prompts

```jsx
// Don't gate hard, prompt gently
<FeatureUsageAlert
  feature="exports"
  limit={10}
  used={8}
  plan="free"
>
  <Alert variant="info">
    <div className="flex items-center justify-between">
      <div>
        <strong>You've used 8 of 10 exports this month</strong>
        <p className="text-sm">Upgrade to Pro for unlimited exports</p>
      </div>
      <Button variant="primary">
        Upgrade
      </Button>
    </div>
  </Alert>
</FeatureUsageAlert>

// Show before they hit wall, not after
if (usage >= limit * 0.8) {
  showUpgradePrompt();
}
```

**Timing is Everything:**
- ✅ 80% of limit: Friendly reminder
- ✅ 100% of limit: Soft gate with upgrade CTA
- ❌ 0% of limit: Don't spam with upgrade prompts

---

### Pattern 7: Tiered Feature Visibility

```jsx
// Show features, don't hide them
<FeatureCard available={user.plan === 'pro'}>
  <FeatureIcon icon={<AutomationIcon />} />
  <FeatureTitle>Advanced Automation</FeatureTitle>
  <FeatureDescription>
    Trigger workflows automatically based on events
  </FeatureDescription>
  
  {user.plan !== 'pro' ? (
    <UpgradeCTA>
      <LockIcon /> Upgrade to Pro
    </UpgradeCTA>
  ) : (
    <EnableButton>
      Enable Automation
    </EnableButton>
  )}
</FeatureCard>
```

**Psychology:**
- Visibility creates desire
- Clear value proposition
- Frictionless upgrade path
- No "hiding" features (builds resentment)

---

### Pattern 8: Invite Teammates

```jsx
// Best time: Moment of success
<SuccessState>
  <Confetti />
  <h2>Project Created! 🎉</h2>
  <p>You're off to a great start</p>
  
  <InvitePrompt>
    <h3>Want to collaborate?</h3>
    <p>Invite teammates to work together</p>
    <input 
      type="email"
      placeholder="teammate@company.com"
    />
    <button>Send Invite</button>
    
    <small>
      <strong>Pro tip:</strong> Teams with 3+ members 
      complete projects 5x faster
    </small>
  </InvitePrompt>
</SuccessState>
```

**Why This Works:**
- Timing: Capitalize on excitement
- Social proof: "5x faster"
- Frictionless: One input field
- Value-first: Better collaboration, not "invite spam"

---

## Part IV: Enterprise Unlocks

Design features that enable enterprise sales.

### Pattern 9: Admin Controls

```jsx
// Enterprise buyers need governance
<AdminDashboard>
  <TeamManagement>
    • Role-based permissions
    • Bulk user provisioning
    • SSO/SAML integration
    • Auto-deprovisioning
  </TeamManagement>
  
  <SecurityControls>
    • IP allowlisting
    • Session timeout
    • Password policies
    • 2FA enforcement
  </SecurityControls>
  
  <ComplianceTools>
    • Audit logs
    • Data export
    • GDPR tools
    • SOC 2 reports
  </ComplianceTools>
</AdminDashboard>
```

**Sales Impact:**
- Reduces procurement objections
- Enables IT approval
- Accelerates deal cycles
- Commands premium pricing

---

### Pattern 10: Audit Trails

```jsx
// Who did what, when?
<AuditLog>
  <LogEntry>
    <Avatar user={user} />
    <Action>
      <strong>{user.name}</strong> deleted 
      project "{project.name}"
    </Action>
    <Timestamp>2 hours ago</Timestamp>
    <UndoButton>Restore</UndoButton>
  </LogEntry>
</AuditLog>
```

**Enterprise Value:**
- Accountability
- Compliance (HIPAA, SOC 2)
- Security investigation
- Dispute resolution

---

## Part V: Activation Design

Fast time-to-value = higher conversion.

### Pattern 11: Smart Onboarding

```jsx
// PROGRESSIVE ONBOARDING
// Not: 10-step wizard
// Yes: Contextual guidance

<App>
  {user.isNew && !user.hasCreatedProject && (
    <Tooltip 
      target="#create-project-button"
      placement="bottom"
    >
      <strong>Start here!</strong>
      <p>Create your first project to get started</p>
    </Tooltip>
  )}
  
  {user.hasCreatedProject && !user.hasInvitedTeam && (
    <BannerPrompt>
      Great work! Now invite your team to collaborate
    </BannerPrompt>
  )}
</App>
```

**Principles:**
- Show guidance at point of need
- One step at a time
- Celebrate progress
- Get to value fast

---

### Pattern 12: Pre-Populated Examples

```jsx
// Don't start with blank slate
useEffect(() => {
  if (user.projects.length === 0) {
    createExampleProject({
      name: "Welcome to [Product]",
      description: "Try editing this project to get started",
      tasks: [
        { title: "Click here to complete a task", done: false },
        { title: "Invite a teammate", done: false },
        { title: "Customize your workspace", done: false }
      ]
    });
  }
}, []);
```

**Why it Works:**
- No blank slate paralysis
- Learning by doing
- Immediate value perception
- Can delete or modify

---

## Part VI: Retention Design

Keep users coming back.

### Pattern 13: Habit Formation

```jsx
// Daily/weekly rituals
<DailyDigest time="9:00 AM">
  <h3>Good morning, {user.firstName}! ☀️</h3>
  
  <Section>
    <h4>Today's priorities</h4>
    {todaysTasks.map(task => (
      <TaskItem task={task} />
    ))}
  </Section>
  
  <Section>
    <h4>Yesterday's wins</h4>
    {yesterdayCompleted.length} tasks completed
  </Section>
  
  <CTA>View your dashboard →</CTA>
</DailyDigest>
```

**Habit Loop:**
- Trigger: Daily email/notification
- Routine: Check dashboard
- Reward: See progress

---

### Pattern 14: Streaks and Milestones

```jsx
<StreakWidget>
  <FireIcon />
  <div>
    <strong>7 day streak!</strong>
    <p>You've logged in every day this week</p>
  </div>
</StreakWidget>

<MilestoneAlert>
  <TrophyIcon />
  <div>
    <strong>Milestone: 100 tasks completed! 🎉</strong>
    <p>You're in the top 10% of users</p>
    <ShareButton>Share achievement</ShareButton>
  </div>
</MilestoneAlert>
```

**Psychology:**
- Loss aversion (don't break streak)
- Achievement unlocking
- Social validation
- Gamification without feeling childish

---

## Part VII: Measurement

Design instrumentation into features.

### Events to Track

```jsx
// Activation
track('user_signup_completed')
track('first_project_created')
track('first_task_completed')
track('first_teammate_invited')

// Engagement
track('daily_active')
track('feature_used', { feature: 'automation' })
track('export_generated')

// Expansion
track('upgrade_prompt_viewed')
track('upgrade_prompt_clicked')
track('plan_upgraded', { from: 'free', to: 'pro' })

// Retention
track('session_started')
track('milestone_achieved', { milestone: '100_tasks' })
track('streak_maintained', { days: 7 })

// Virality
track('teammate_invited')
track('report_shared')
track('public_profile_viewed')
```

### Dashboards to Build

```jsx
// ACTIVATION FUNNEL
Signup → First Project → First Task → First Invite

// FEATURE ADOPTION
% of users who've used each feature
Time to first use

// EXPANSION METRICS
Free → Pro conversion rate
Upgrade prompt CTR
Average seats per account

// RETENTION COHORTS
Day 1, 7, 30, 90 retention
Churn reasons
Reactivation rate
```

---

## Critical Principles

1. **Value visibility** — Quantify impact, show ROI, make shareable
2. **Shareable artifacts** — Every export is marketing
3. **Expansion hooks** — Usage prompts, tiered visibility, team invites
4. **Enterprise unlocks** — Admin controls, audit trails, compliance
5. **Fast activation** — Progressive onboarding, smart defaults, examples
6. **Habit formation** — Daily rituals, streaks, milestones
7. **Measure everything** — Instrument all commercial features

**The Goal**: Product sells itself through great design.
