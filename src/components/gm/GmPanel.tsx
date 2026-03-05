import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useCampaign } from '../../contexts/CampaignContext';
import CampaignConfig from '../campaign/CampaignConfig';

interface GmPanelProps {
  campaignId: string;
  onBack: () => void;
}

export default function GmPanel({ campaignId, onBack }: GmPanelProps) {
  const [campaignMode, setCampaignMode] = useState<'exploration' | 'combat'>('exploration');

  useEffect(() => {
    supabase.from('campaigns')
      .select('mode')
      .eq('id', campaignId)
      .single()
      .then(({ data }) => { if (data) setCampaignMode(data.mode); });

    // Écouter les changements de mode en temps réel
    const ch = supabase.channel('gmpanel-' + campaignId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'campaigns',
        filter: `id=eq.${campaignId}`,
      }, (p: any) => {
        if (p.new?.mode) setCampaignMode(p.new.mode);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId]);

  return (
    <CampaignConfig
      campaignId={campaignId}
      campaignMode={campaignMode}
      onBack={onBack}
    />
  );
}