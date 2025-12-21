'use client';

import { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconBuilding,
  IconGlobe,
  IconCheck,
  IconUpload,
} from '@/components/icons';
import Link from 'next/link';

const DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO', 'High School', 'Showcase'];

interface OrganizationData {
  id: string;
  name: string;
  type: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  location_city?: string;
  location_state?: string;
  division?: string;
  conference?: string;
  primary_color?: string;
  secondary_color?: string;
}

export default function ProgramPage() {
  const { user, coach, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<OrganizationData>>({});

  useEffect(() => {
    async function fetchData() {
      if (!coach?.organization_id) {
        setLoading(false);
        return;
      }

      const supabase = createClient();

      // Fetch organization
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', coach.organization_id)
        .single();

      if (orgData) {
        // Convert null values to undefined to match TypeScript interface
        const cleanedData: OrganizationData = {
          id: orgData.id,
          name: orgData.name,
          type: orgData.type,
          description: orgData.description ?? undefined,
          logo_url: orgData.logo_url ?? undefined,
          website_url: orgData.website_url ?? undefined,
          location_city: orgData.location_city ?? undefined,
          location_state: orgData.location_state ?? undefined,
          division: orgData.division ?? undefined,
          conference: orgData.conference ?? undefined,
          primary_color: orgData.primary_color ?? undefined,
          secondary_color: orgData.secondary_color ?? undefined,
        };
        setOrganization(cleanedData);
        setFormData(cleanedData);
      }

      setLoading(false);
    }

    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, coach?.organization_id]);

  const handleInputChange = (field: keyof OrganizationData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveBasicInfo = async () => {
    if (!organization?.id) return;

    setSaving(true);
    setSaveMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('organizations')
      .update({
        name: formData.name,
        description: formData.description,
        website_url: formData.website_url,
        location_city: formData.location_city,
        location_state: formData.location_state,
        division: formData.division,
        conference: formData.conference,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organization.id);

    setSaving(false);

    if (error) {
      setSaveMessage({ type: 'error', text: 'Failed to save changes. Please try again.' });
    } else {
      setSaveMessage({ type: 'success', text: 'Program info saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization?.id) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be less than 2MB', 'error');
      return;
    }

    setUploadingLogo(true);

    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop();
      const fileName = `${organization.id}-logo-${Date.now()}.${fileExt}`;
      const filePath = `organizations/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        showToast('Failed to upload logo', 'error');
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      // Update organization with new logo URL
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', organization.id);

      if (updateError) {
        console.error('Update error:', updateError);
        showToast('Failed to update logo', 'error');
        return;
      }

      // Update local state
      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      setOrganization(prev => prev ? { ...prev, logo_url: publicUrl } : null);
      showToast('Logo updated successfully', 'success');
    } catch (error) {
      console.error('Logo upload error:', error);
      showToast('An error occurred while uploading', 'error');
    } finally {
      setUploadingLogo(false);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (authLoading || loading) return <PageLoading />;

  if (user?.role !== 'coach' || !coach) {
    return (
      <>
        <Header title="Program Profile" subtitle="Coach access required" />
        <div className="p-6">
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-slate-500">This page is only available to coaches.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!organization) {
    return (
      <>
        <Header title="Program Profile" subtitle="No organization found" />
        <div className="p-6">
          <Card>
            <CardContent className="p-12 text-center">
              <IconBuilding size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Program Found</h3>
              <p className="text-slate-500 mb-4">Your account is not associated with a program yet.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Program Profile"
        subtitle="Customize how your program appears to recruits"
      >
        <Link href={`/baseball/program/${organization.id}`} target="_blank">
          <Button variant="secondary" size="sm" className="gap-2">
            <IconGlobe size={14} />
            View Public Page
          </Button>
        </Link>
      </Header>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Program Information</h3>
                <p className="text-sm text-slate-500">
                  This information appears on your public program page that recruits can view.
                </p>
              </div>

              {/* Logo Preview */}
              <div className="flex items-start gap-6 p-4 bg-slate-50 rounded-xl">
                {formData.logo_url ? (
                  <img
                    src={formData.logo_url}
                    alt="Program logo"
                    className="w-24 h-24 rounded-xl object-cover border-2 border-white shadow-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-green-600 flex items-center justify-center">
                    <IconBuilding size={40} className="text-white" />
                  </div>
                )}
                <div>
                  <h4 className="font-medium text-slate-900 mb-1">Program Logo</h4>
                  <p className="text-sm text-slate-500 mb-3">Upload a logo for your program page (max 2MB).</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploadingLogo}
                  >
                    {!uploadingLogo && <IconUpload size={14} className="mr-2" />}
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Program Name"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Texas A&M University Baseball"
                />

                <Input
                  label="Website URL"
                  value={formData.website_url || ''}
                  onChange={(e) => handleInputChange('website_url', e.target.value)}
                  placeholder="https://12thman.com/baseball"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Division</label>
                  <select
                    value={formData.division || ''}
                    onChange={(e) => handleInputChange('division', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white"
                  >
                    <option value="">Select Division</option>
                    {DIVISIONS.map(div => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Conference"
                  value={formData.conference || ''}
                  onChange={(e) => handleInputChange('conference', e.target.value)}
                  placeholder="SEC"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="City"
                  value={formData.location_city || ''}
                  onChange={(e) => handleInputChange('location_city', e.target.value)}
                  placeholder="College Station"
                />

                <Input
                  label="State"
                  value={formData.location_state || ''}
                  onChange={(e) => handleInputChange('location_state', e.target.value)}
                  placeholder="TX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">About Your Program</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400"
                  placeholder="Tell recruits about your program, culture, and what makes it special..."
                />
              </div>

              {/* Color Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.primary_color || '#16A34A'}
                      onChange={(e) => handleInputChange('primary_color', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.primary_color || '#16A34A'}
                      onChange={(e) => handleInputChange('primary_color', e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
                      placeholder="#16A34A"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.secondary_color || '#FFFFFF'}
                      onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.secondary_color || '#FFFFFF'}
                      onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                {saveMessage && (
                  <p className={cn(
                    'text-sm font-medium flex items-center gap-2',
                    saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'
                  )}>
                    {saveMessage.type === 'success' && <IconCheck size={16} />}
                    {saveMessage.text}
                  </p>
                )}
                <div className="ml-auto">
                  <Button onClick={handleSaveBasicInfo} loading={saving}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
