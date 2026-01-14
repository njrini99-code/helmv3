# Marketing Patterns

Systematic patterns for landing pages, heroes, and conversion-focused interfaces.

## Hero Section Anatomy

```
┌─────────────────────────────────────────────────────┐
│  [Logo]                    [Nav]    [CTA]           │  ← Chrome
├─────────────────────────────────────────────────────┤
│                                                     │
│  ONE HEADLINE (what you do)                         │  ← Value prop
│  Subhead (for whom / why now)                       │  ← Context
│                                                     │
│  [Primary CTA]  [Secondary CTA]                     │  ← Actions
│                                                     │
│  [Product Screenshot / Demo / Hero Moment]          │  ← Proof
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Goal**: Answer "What is this? Is it for me? What should I do?" in 5 seconds.

---

## Hero Patterns

### Minimal Hero

```tsx
<section className="relative min-h-screen flex items-center justify-center px-6">
  {/* Background */}
  <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100" />
  
  {/* Content */}
  <div className="relative z-10 max-w-4xl mx-auto text-center">
    <h1 className="text-6xl md:text-7xl font-bold text-gray-900 mb-6">
      Build faster with AI
    </h1>
    <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-2xl mx-auto">
      Ship production-ready code in hours, not weeks. 
      Join 10,000+ developers building the future.
    </p>
    <div className="flex gap-4 justify-center">
      <button className="px-8 py-4 rounded-lg bg-gray-900 text-white text-lg font-medium hover:bg-gray-800">
        Start Building
      </button>
      <button className="px-8 py-4 rounded-lg border border-gray-300 text-lg font-medium hover:bg-gray-50">
        View Demos
      </button>
    </div>
  </div>
</section>
```

### Glass Hero with Background

```tsx
<section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
  {/* Atmospheric Background */}
  <div className="absolute inset-0">
    <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/20" />
    <div className="absolute inset-0" style={{
      backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
    }} />
  </div>
  
  {/* Glass Container */}
  <div className="relative z-10 max-w-4xl mx-auto">
    <div className="p-12 rounded-3xl border border-white/20 backdrop-blur-xl bg-white/80 shadow-2xl">
      <h1 className="text-6xl font-bold text-gray-900 mb-6 text-center">
        The future of development
      </h1>
      <p className="text-xl text-gray-600 mb-8 text-center max-w-2xl mx-auto">
        Build, deploy, and scale applications with AI assistance
      </p>
      <div className="flex gap-4 justify-center">
        <button className="px-8 py-4 rounded-lg bg-gray-900 text-white font-medium">
          Get Started
        </button>
      </div>
    </div>
  </div>
</section>
```

### Hero with Product Screenshot

```tsx
<section className="px-6 py-20">
  <div className="max-w-7xl mx-auto">
    {/* Headline */}
    <div className="max-w-3xl mx-auto text-center mb-12">
      <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
        Manage your team with clarity
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Everything you need to plan, track, and ship great software
      </p>
      <button className="px-8 py-4 rounded-lg bg-gray-900 text-white text-lg font-medium">
        Start Free Trial
      </button>
    </div>
    
    {/* Product Screenshot */}
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-3xl" />
      <img 
        src="dashboard-screenshot.png" 
        alt="Product dashboard"
        className="relative z-10 rounded-2xl shadow-2xl border border-gray-200"
      />
    </div>
  </div>
</section>
```

---

## Feature Sections (Bento Grids)

### Bento Grid Pattern

```tsx
<section className="px-6 py-20">
  <div className="max-w-7xl mx-auto">
    <div className="text-center mb-12">
      <h2 className="text-4xl font-bold text-gray-900 mb-4">
        Everything you need
      </h2>
      <p className="text-xl text-gray-600">
        Built for teams that ship fast
      </p>
    </div>
    
    <div className="grid grid-cols-6 gap-4">
      {/* Hero Feature - 4 cols, 2 rows */}
      <div className="col-span-6 lg:col-span-4 lg:row-span-2 p-8 rounded-2xl border border-gray-200 bg-white">
        <h3 className="text-2xl font-bold mb-4">Real-time collaboration</h3>
        <p className="text-gray-600 mb-6">Work together seamlessly</p>
        <img src="feature-1.png" className="w-full rounded-lg" />
      </div>
      
      {/* Supporting Features - 2 cols each */}
      <div className="col-span-6 lg:col-span-2 p-6 rounded-2xl border border-gray-200 bg-white">
        <h3 className="text-xl font-bold mb-2">Fast Performance</h3>
        <p className="text-gray-600 text-sm">Lightning quick</p>
      </div>
      
      <div className="col-span-6 lg:col-span-2 p-6 rounded-2xl border border-gray-200 bg-white">
        <h3 className="text-xl font-bold mb-2">Secure by Default</h3>
        <p className="text-gray-600 text-sm">Enterprise-grade</p>
      </div>
      
      {/* Full Width Feature */}
      <div className="col-span-6 p-8 rounded-2xl border border-gray-200 bg-white flex items-center gap-8">
        <div className="flex-1">
          <h3 className="text-2xl font-bold mb-4">Analytics Dashboard</h3>
          <p className="text-gray-600">Track everything that matters</p>
        </div>
        <img src="analytics.png" className="flex-1 rounded-lg" />
      </div>
    </div>
  </div>
</section>
```

**Bento Rules**:
- One hero card (largest, most important)
- Varied sizing shows hierarchy
- Avoid "box soup" (all cards same size)
- Each card has ONE job (answers one question)

---

## Social Proof Patterns

### Logo Cloud

```tsx
<section className="px-6 py-12 bg-gray-50">
  <div className="max-w-7xl mx-auto text-center">
    <p className="text-sm text-gray-600 mb-8">
      Trusted by teams at
    </p>
    <div className="flex flex-wrap justify-center items-center gap-12 opacity-60 grayscale">
      <img src="logo-1.svg" className="h-8" />
      <img src="logo-2.svg" className="h-8" />
      <img src="logo-3.svg" className="h-8" />
      <img src="logo-4.svg" className="h-8" />
      <img src="logo-5.svg" className="h-8" />
    </div>
  </div>
</section>
```

### Testimonial Cards

```tsx
<section className="px-6 py-20">
  <div className="max-w-7xl mx-auto">
    <h2 className="text-4xl font-bold text-center mb-12">
      What our customers say
    </h2>
    
    <div className="grid md:grid-cols-3 gap-6">
      <div className="p-6 rounded-2xl border border-gray-200 bg-white">
        <div className="flex gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <StarIcon key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          ))}
        </div>
        <p className="text-gray-600 mb-6">
          "This tool completely changed how we ship code. 
          We're 10x faster now."
        </p>
        <div className="flex items-center gap-3">
          <img src="avatar.jpg" className="w-10 h-10 rounded-full" />
          <div>
            <div className="font-medium text-gray-900">Jane Doe</div>
            <div className="text-sm text-gray-500">CEO, Acme Corp</div>
          </div>
        </div>
      </div>
      {/* Repeat for more testimonials */}
    </div>
  </div>
</section>
```

---

## Pricing Section

### Simple Pricing Cards

```tsx
<section className="px-6 py-20 bg-gray-50">
  <div className="max-w-7xl mx-auto">
    <div className="text-center mb-12">
      <h2 className="text-4xl font-bold text-gray-900 mb-4">
        Simple, transparent pricing
      </h2>
      <p className="text-xl text-gray-600">
        Choose the plan that's right for you
      </p>
    </div>
    
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {/* Starter */}
      <div className="p-8 rounded-2xl border border-gray-200 bg-white">
        <h3 className="text-xl font-bold mb-2">Starter</h3>
        <div className="mb-6">
          <span className="text-4xl font-bold">$29</span>
          <span className="text-gray-600">/month</span>
        </div>
        <ul className="space-y-3 mb-8">
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">Up to 5 users</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">10 GB storage</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">Email support</span>
          </li>
        </ul>
        <button className="w-full px-4 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
          Get Started
        </button>
      </div>
      
      {/* Pro - Highlighted */}
      <div className="p-8 rounded-2xl bg-gray-900 text-white relative">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium">
          Most Popular
        </div>
        <h3 className="text-xl font-bold mb-2">Pro</h3>
        <div className="mb-6">
          <span className="text-4xl font-bold">$99</span>
          <span className="text-white/70">/month</span>
        </div>
        <ul className="space-y-3 mb-8">
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Unlimited users</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>100 GB storage</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <span>Priority support</span>
          </li>
        </ul>
        <button className="w-full px-4 py-3 rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100">
          Get Started
        </button>
      </div>
      
      {/* Enterprise */}
      <div className="p-8 rounded-2xl border border-gray-200 bg-white">
        <h3 className="text-xl font-bold mb-2">Enterprise</h3>
        <div className="mb-6">
          <span className="text-4xl font-bold">Custom</span>
        </div>
        <ul className="space-y-3 mb-8">
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">Everything in Pro</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">Custom integrations</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600">Dedicated support</span>
          </li>
        </ul>
        <button className="w-full px-4 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
          Contact Sales
        </button>
      </div>
    </div>
  </div>
</section>
```

---

## CTA Sections

### Simple CTA

```tsx
<section className="px-6 py-20 bg-gray-900 text-white">
  <div className="max-w-3xl mx-auto text-center">
    <h2 className="text-4xl md:text-5xl font-bold mb-6">
      Ready to get started?
    </h2>
    <p className="text-xl text-gray-300 mb-8">
      Join thousands of teams building better products
    </p>
    <div className="flex gap-4 justify-center">
      <button className="px-8 py-4 rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100">
        Start Free Trial
      </button>
      <button className="px-8 py-4 rounded-lg border border-white/20 text-white font-medium hover:bg-white/10">
        View Pricing
      </button>
    </div>
  </div>
</section>
```

### Glass CTA (Atmospheric)

```tsx
<section className="relative px-6 py-32 overflow-hidden">
  {/* Background */}
  <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600" />
  <div className="absolute inset-0 opacity-30" style={{
    backgroundImage: 'url("noise-texture.png")'
  }} />
  
  {/* Content */}
  <div className="relative z-10 max-w-4xl mx-auto">
    <div className="p-12 rounded-3xl border border-white/20 backdrop-blur-xl bg-white/10 text-white text-center">
      <h2 className="text-5xl font-bold mb-6">
        The future is here
      </h2>
      <p className="text-xl mb-8 text-white/90">
        Start building with AI today
      </p>
      <button className="px-8 py-4 rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100">
        Get Started Free
      </button>
    </div>
  </div>
</section>
```

---

## Scroll-Driven Storytelling

### Sticky Scroll Sections

```tsx
<section className="relative">
  {[
    { title: "Plan", description: "Organize your work" },
    { title: "Build", description: "Ship faster" },
    { title: "Scale", description: "Grow with confidence" }
  ].map((item, i) => (
    <div key={i} className="sticky top-0 min-h-screen flex items-center justify-center">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-6xl font-bold mb-6">{item.title}</h2>
        <p className="text-2xl text-gray-600">{item.description}</p>
      </div>
    </div>
  ))}
</section>
```

### Parallax Layers

```tsx
<section className="relative min-h-screen overflow-hidden">
  <div 
    className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600"
    style={{ transform: `translateY(${scrollY * 0.5}px)` }}
  />
  <div 
    className="absolute inset-0"
    style={{ transform: `translateY(${scrollY * 0.3}px)` }}
  >
    <img src="layer-2.png" />
  </div>
  <div className="relative z-10 flex items-center justify-center min-h-screen">
    <h1 className="text-6xl font-bold text-white">Hero Content</h1>
  </div>
</section>
```

---

## Marketing Navigation

### Glass Nav

```tsx
<nav className="sticky top-0 z-50 px-6 py-4 border-b border-white/20 backdrop-blur-md bg-white/70">
  <div className="max-w-7xl mx-auto flex items-center justify-between">
    <img src="logo.svg" className="h-8" />
    
    <div className="hidden md:flex items-center gap-8">
      <a href="#features" className="text-gray-700 hover:text-gray-900">Features</a>
      <a href="#pricing" className="text-gray-700 hover:text-gray-900">Pricing</a>
      <a href="#docs" className="text-gray-700 hover:text-gray-900">Docs</a>
    </div>
    
    <div className="flex items-center gap-4">
      <button className="px-4 py-2 text-gray-700 hover:text-gray-900">
        Sign In
      </button>
      <button className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
        Get Started
      </button>
    </div>
  </div>
</nav>
```

---

## Critical Marketing Rules

1. **One story per viewport**: Each section answers ONE question
2. **Hero clarity**: Value prop in < 5 seconds
3. **One primary CTA**: Don't compete with yourself
4. **Glass OK for atmosphere**: Heroes, backgrounds, footer CTAs
5. **Bento hierarchy**: Varied card sizing shows importance
6. **One hero moment**: One 3D/parallax/animation per page max
7. **Social proof**: Logos, testimonials, metrics
8. **Pricing transparency**: Clear comparison, recommended tier
9. **Footer CTA**: Reinforce primary action
10. **Reduced motion**: Support accessibility
