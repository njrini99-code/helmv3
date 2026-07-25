'use client';

// =============================================================================
// ProfileEditor — the recruiting-file editor for high-school / JUCO / showcase
// players (opt-in recruiting exposure — see CLAUDE.md "Recruiting Activation
// Model"). College players get `CollegeProfileEditor` instead
// (`src/components/baseball/profile/CollegeProfileEditor.tsx`); routing between
// the two lives in `profile/page.tsx` and is UNCHANGED.
//
// WRITE surface — every field/handler PRESERVED VERBATIM: `handleInputChange`,
// `handleSave`, every `formData` key, the Videos-page hand-off link. This pass is
// PRESENTATION ONLY, rebuilt onto the Living-Annual kit
// (`@/components/baseball/living-annual`) + Fairway form primitives
// (`@/components/fairway`). The page already renders inside `.living-annual` /
// `.fairway-ds` via BaseballFairwayShell, and `(dashboard)/dashboard/template.tsx`
// already mounts `<LazyMotion features={domAnimation}>`, so this file does not
// mount its own motion provider.
//
// ADDENDUM 2 (design-system-living-annual.md) drops Fraunces + Fragment Mono from
// the baseball kit — Space Grotesk (`font-annual`) only. Fairway `FormSection`'s
// heading and `NumberField`'s numeral both hardcode the banned faces, so this file
// intentionally skips both: section headers are plain `font-annual` markup, and
// numeric fields use `Input type="number"`.
// =============================================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Player } from '@/lib/types';
import { Button, FormField, Input, TextArea, Select, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/fairway';
import { PaperCard, Reveal } from '@/components/baseball/living-annual';
import {
  IconUser,
  IconActivity,
  IconGraduationCap,
  IconVideo,
  IconMail,
  IconCheck,
  IconAlertCircle,
} from '@/components/icons';

interface ProfileEditorProps {
  player: Player;
  onUpdate: (updates: Partial<Player>) => Promise<void>;
  className?: string;
}

type TabId = 'personal' | 'athletic' | 'academic' | 'videos' | 'social';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'personal', label: 'Personal', icon: <IconUser size={16} /> },
  { id: 'athletic', label: 'Athletic', icon: <IconActivity size={16} /> },
  { id: 'academic', label: 'Academic', icon: <IconGraduationCap size={16} /> },
  { id: 'videos', label: 'Videos', icon: <IconVideo size={16} /> },
  { id: 'social', label: 'Social', icon: <IconMail size={16} /> },
];

const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const STATE_OPTIONS = US_STATES.map((s) => ({ label: s, value: s }));

const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
const GRAD_YEAR_OPTIONS = GRAD_YEARS.map((y) => ({ label: String(y), value: String(y) }));

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTL'];
const POSITION_OPTIONS = POSITIONS.map((p) => ({ label: p, value: p }));

const BATS_OPTIONS = [
  { label: 'Right', value: 'R' },
  { label: 'Left', value: 'L' },
  { label: 'Switch', value: 'S' },
];
const THROWS_OPTIONS = [
  { label: 'Right', value: 'R' },
  { label: 'Left', value: 'L' },
];

export function ProfileEditor({ player, onUpdate, className }: ProfileEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [formData, setFormData] = useState<Partial<Player>>(player);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleInputChange = (field: keyof Player, value: string | number | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onUpdate(formData);
      setSaveMessage('Profile updated successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Reveal className={cn(className)}>
      <PaperCard>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <div className="px-5 pt-4 sm:px-6">
            <TabsList aria-label="Profile sections">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="p-5 sm:p-6">
            <TabsContent value="personal" className="space-y-5">
              <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                <IconUser size={18} className="text-text-tertiary" />
                Personal Information
              </h3>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="First name" required>
                  <Input
                    value={formData.first_name || ''}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    required
                  />
                </FormField>

                <FormField label="Last name" required>
                  <Input
                    value={formData.last_name || ''}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    required
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="City" showOptional>
                  <Input value={formData.city || ''} onChange={(e) => handleInputChange('city', e.target.value)} />
                </FormField>

                <FormField label="State" required>
                  <Select
                    value={formData.state || undefined}
                    onValueChange={(v) => handleInputChange('state', v ?? '')}
                    options={STATE_OPTIONS}
                    placeholder="Select state"
                  />
                </FormField>
              </div>

              <FormField label="High school" required>
                <Input
                  value={formData.high_school_name || ''}
                  onChange={(e) => handleInputChange('high_school_name', e.target.value)}
                  required
                />
              </FormField>

              <FormField label="About me" showOptional>
                <TextArea
                  rows={4}
                  value={formData.about_me || ''}
                  onChange={(e) => handleInputChange('about_me', e.target.value)}
                  placeholder="Tell coaches about yourself…"
                />
              </FormField>
            </TabsContent>

            <TabsContent value="athletic" className="space-y-5">
              <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                <IconActivity size={18} className="text-text-tertiary" />
                Athletic Information
              </h3>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="Position" required>
                  <Select
                    value={formData.primary_position || undefined}
                    onValueChange={(v) => handleInputChange('primary_position', v ?? '')}
                    options={POSITION_OPTIONS}
                    placeholder="Select position"
                  />
                </FormField>

                <FormField label="Graduation year" required>
                  <Select
                    value={formData.grad_year ? String(formData.grad_year) : undefined}
                    onValueChange={(v) => handleInputChange('grad_year', v ? parseInt(v) : null)}
                    options={GRAD_YEAR_OPTIONS}
                    placeholder="Select year"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="Bats" showOptional>
                  <Select
                    value={formData.bats || undefined}
                    onValueChange={(v) => handleInputChange('bats', v ?? '')}
                    options={BATS_OPTIONS}
                    placeholder="Select"
                  />
                </FormField>

                <FormField label="Throws" showOptional>
                  <Select
                    value={formData.throws || undefined}
                    onValueChange={(v) => handleInputChange('throws', v ?? '')}
                    options={THROWS_OPTIONS}
                    placeholder="Select"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="Height" showOptional>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Feet"
                      min="4"
                      max="7"
                      value={formData.height_feet || ''}
                      onChange={(e) => handleInputChange('height_feet', e.target.value ? parseInt(e.target.value) : null)}
                    />
                    <Input
                      aria-label="Height inches"
                      type="number"
                      placeholder="Inches"
                      min="0"
                      max="11"
                      value={formData.height_inches || ''}
                      onChange={(e) => handleInputChange('height_inches', e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </div>
                </FormField>

                <FormField label="Weight" showOptional>
                  <Input
                    type="number"
                    trailing="lbs"
                    value={formData.weight_lbs || ''}
                    onChange={(e) => handleInputChange('weight_lbs', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="185"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="Pitch velocity" showOptional>
                  <Input
                    type="number"
                    trailing="mph"
                    value={formData.pitch_velo || ''}
                    onChange={(e) => handleInputChange('pitch_velo', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="85"
                  />
                </FormField>

                <FormField label="Exit velocity" showOptional>
                  <Input
                    type="number"
                    trailing="mph"
                    value={formData.exit_velo || ''}
                    onChange={(e) => handleInputChange('exit_velo', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="90"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="60-yard time" showOptional>
                  <Input
                    type="number"
                    step="0.01"
                    trailing="sec"
                    value={formData.sixty_time || ''}
                    onChange={(e) => handleInputChange('sixty_time', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="7.2"
                  />
                </FormField>

                <FormField label="Pop time" showOptional help="For catchers">
                  <Input
                    type="number"
                    step="0.01"
                    trailing="sec"
                    value={formData.pop_time || ''}
                    onChange={(e) => handleInputChange('pop_time', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="2.0"
                  />
                </FormField>
              </div>
            </TabsContent>

            <TabsContent value="academic" className="space-y-5">
              <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                <IconGraduationCap size={18} className="text-text-tertiary" />
                Academic Information
              </h3>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField label="GPA" showOptional>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4.0"
                    value={formData.gpa || ''}
                    onChange={(e) => handleInputChange('gpa', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="3.75"
                  />
                </FormField>

                <FormField label="SAT score" showOptional>
                  <Input
                    type="number"
                    value={formData.sat_score || ''}
                    onChange={(e) => handleInputChange('sat_score', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="1200"
                  />
                </FormField>
              </div>

              <FormField label="ACT score" showOptional>
                <Input
                  type="number"
                  value={formData.act_score || ''}
                  onChange={(e) => handleInputChange('act_score', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="28"
                />
              </FormField>
            </TabsContent>

            <TabsContent value="videos" className="space-y-5">
              <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                <IconVideo size={18} className="text-text-tertiary" />
                Video Settings
              </h3>

              <PaperCard grain={false} className="p-4">
                <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
                  Manage your highlight videos and game footage from the Videos page in your dashboard.
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-3">
                  <a href="/baseball/dashboard/videos">Go to Videos</a>
                </Button>
              </PaperCard>

              <div className="border-t border-[color:var(--hairline)] pt-4">
                <Checkbox
                  label="I have highlight videos uploaded"
                  checked={formData.has_video || false}
                  onCheckedChange={(checked) => handleInputChange('has_video', checked === true)}
                />
              </div>
            </TabsContent>

            <TabsContent value="social" className="space-y-5">
              <h3 className="flex items-center gap-2 font-annual text-h3 text-text-primary">
                <IconMail size={18} className="text-text-tertiary" />
                Social & Contact Information
              </h3>

              <FormField label="Email" required>
                <Input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Phone number" showOptional>
                <Input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </FormField>

              <FormField label="Twitter handle" showOptional>
                <Input
                  leading="@"
                  value={formData.twitter || ''}
                  onChange={(e) => handleInputChange('twitter', e.target.value)}
                  placeholder="username"
                />
              </FormField>

              <FormField label="Instagram handle" showOptional>
                <Input
                  leading="@"
                  value={formData.instagram || ''}
                  onChange={(e) => handleInputChange('instagram', e.target.value)}
                  placeholder="username"
                />
              </FormField>
            </TabsContent>

            {/* Save Button */}
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-[color:var(--hairline)] pt-6">
              <div className="min-h-[20px]">
                {saveMessage ? (
                  <Reveal key={saveMessage}>
                    <p
                      role={saveMessage.includes('successfully') ? 'status' : 'alert'}
                      aria-live="polite"
                      className={cn(
                        'flex items-center gap-1.5 font-annual text-body-sm font-medium',
                        saveMessage.includes('successfully') ? 'text-grade-plus' : 'text-fw-danger-ink',
                      )}
                    >
                      {saveMessage.includes('successfully') ? (
                        <IconCheck size={14} className="shrink-0" />
                      ) : (
                        <IconAlertCircle size={14} className="shrink-0" />
                      )}
                      {saveMessage}
                    </p>
                  </Reveal>
                ) : null}
              </div>
              <Button variant="primary" onClick={handleSave} busy={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Tabs>
      </PaperCard>
    </Reveal>
  );
}
