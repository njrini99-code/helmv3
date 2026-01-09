'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconUpload } from '@/components/icons';

interface TeamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function TeamSettingsModal({ isOpen, onClose, onUpdate }: TeamSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Team fields
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('');

  // Organization fields
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [division, setDivision] = useState('');
  const [conference, setConference] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadTeamData();
    }
  }, [isOpen]);

  async function loadTeamData() {
    setLoadingData(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get coach's team
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('team_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.team_id) return;

      // Get team details with organization
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name, season, organization_id')
        .eq('id', coach.team_id)
        .single();

      if (team) {
        setTeamId(team.id);
        setTeamName(team.name || '');
        setSeason(team.season || '');
        setOrganizationId(team.organization_id);

        // Load organization data if exists
        if (team.organization_id) {
          const { data: org } = await supabase
            .from('golf_organizations')
            .select('id, name, city, state, division, conference, logo_url')
            .eq('id', team.organization_id)
            .single();

          if (org) {
            setOrgName(org.name || '');
            setCity(org.city || '');
            setState(org.state || '');
            setDivision(org.division || '');
            setConference(org.conference || '');
            setLogoUrl(org.logo_url);
          }
        }
      }
    } catch {
      showToast('Failed to load team data', 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be less than 2MB', 'error');
      return;
    }

    setUploadingLogo(true);
    const supabase = createClient();

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `org-logos/${organizationId}-${Date.now()}.${fileExt}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('golf-assets')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('golf-assets')
        .getPublicUrl(fileName);

      // Update organization with new logo URL
      const { error: updateError } = await supabase
        .from('golf_organizations')
        .update({ logo_url: publicUrl })
        .eq('id', organizationId);

      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      showToast('Logo uploaded successfully', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!teamId) {
      showToast('No team found', 'error');
      return;
    }

    if (!teamName.trim()) {
      showToast('Team name is required', 'error');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // Update team
      const { error: teamError } = await supabase
        .from('golf_teams')
        .update({
          name: teamName.trim(),
          season: season.trim() || undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      if (teamError) throw teamError;

      // Update organization if exists
      if (organizationId) {
        const { error: orgError } = await supabase
          .from('golf_organizations')
          .update({
            name: orgName.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
            division: division.trim() || undefined,
            conference: conference.trim() || undefined,
            updated_at: new Date().toISOString()
          })
          .eq('id', organizationId);

        if (orgError) throw orgError;
      }

      showToast('Team settings updated', 'success');
      onUpdate();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update team', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Settings">
      {loadingData ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Team Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 border-b pb-2">Team Information</h3>

            <Input
              label="Team Name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Men's Golf Team"
              required
            />

            <Input
              label="Season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="2024-2025"
            />

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-600">
                Team name is visible to all members and on shared scorecards.
              </p>
            </div>
          </div>

          {/* Organization Section */}
          {organizationId && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 border-b pb-2">Organization Details</h3>

              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Team Logo</label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Team logo"
                      className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                      <IconUpload size={24} className="text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 file:cursor-pointer"
                      id="logo-upload"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      PNG, JPG up to 2MB
                    </p>
                  </div>
                </div>
              </div>

              <Input
                label="School/Organization Name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="University of California"
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Los Angeles"
                />
                <Input
                  label="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="CA"
                  maxLength={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  placeholder="Division I"
                />
                <Input
                  label="Conference"
                  value={conference}
                  onChange={(e) => setConference(e.target.value)}
                  placeholder="Pac-12"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={loading}>
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
