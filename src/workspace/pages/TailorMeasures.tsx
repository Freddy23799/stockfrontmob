import { useState } from 'react';
import { View } from 'react-native';

import { CurrentMeasures, ClientFinder, MemberBar, SheetForm, useMembers, type Client, type Current } from '@/components/tailor-parts';
import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Empty, ErrorNote, Screen, SectionTitle, Skeleton, Stack, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/tailor';
type Sheet_ = { id: string; partyName: string; memberId?: string | null; memberName?: string | null; label?: string | null; takenOn: string; takenBy?: string | null; unit: string; values: Record<string, number>; notes?: string | null };

/** Mesures : la cliente par son telephone, la personne (elle-meme ou sa famille), ses mesures actuelles et tout l'historique. */
export default function TailorMeasures({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const toast = useToast();
  const [party, setParty] = useState<Client | null>(null);
  const partyId = party?.id ?? null;
  const [who, setWho] = useState<string | null>(null);
  const [members, reloadMembers] = useMembers(partyId);
  const list = useQuery<{ items: Sheet_[]; total: number }>(partyId ? `${API}/clients/${partyId}/measures${qs({ size: 60 })}` : null);
  const cur = useQuery<Current>(partyId ? `${API}/clients/${partyId}/measures/current${qs({ memberId: who ?? undefined })}` : null);
  const [edit, setEdit] = useState(false);
  const person = who ? members.find((m) => m.id === who) : null;
  const sheets = (list.data?.items ?? []).filter((s) => (who ? s.memberId === who : !s.memberId));
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={async () => { await Promise.all([list.reload(), cur.reload()]); }} right={partyId && shop.can('MEASUREMENTS', 'create') ? <Btn small icon="plus" title={t('tl.newSheet')} onPress={() => setEdit(true)} /> : undefined}>
      <ClientFinder value={partyId} selected={party} onChange={(id, c) => { setParty(c); setWho(null); }} />
      {partyId ? <MemberBar partyId={partyId} partyName={party?.name} memberId={who} onChange={setWho} members={members} reload={reloadMembers} label={t('tl.cl.measuresOf')} /> : null}
      {list.error && partyId ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {!partyId ? <Empty icon="ruler" title={t('tl.pickClient')} text={t('tl.pickClientText')} /> : !list.data ? <Skeleton rows={2} /> : (
        <>
          <SectionTitle title={`${t('tl.cl.currentMeasures')}${person ? ` · ${person.name}` : ''}`} />
          <CurrentMeasures values={cur.data} />
          <SectionTitle title={t('tl.cl.sheetsHistory')} />
          {sheets.length === 0 ? <Empty icon="ruler" title={t('tl.noSheet')} text={t('tl.noSheetText')} /> : (
            <Stack gap={8}>{sheets.map((s) => (
              <Card key={s.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <ThemedText type="smallBold" style={{ flex: 1 }}>{s.label || t('tl.sheet')}</ThemedText>{s.memberName ? <Badge>{s.memberName}</Badge> : null}<Badge tone="info">{s.takenOn}</Badge>
                </View>
                {s.takenBy ? <ThemedText type="small" themeColor="textSecondary">{t('tl.takenByShort', { name: s.takenBy })} · {s.unit}</ThemedText> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
                  {Object.entries(s.values).map(([k, v]) => <View key={k}><ThemedText type="small" themeColor="textSecondary">{t(`tl.m.${k}`)}</ThemedText><ThemedText type="smallBold">{v}</ThemedText></View>)}
                </View>
                {s.notes ? <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 6 }}>{s.notes}</ThemedText> : null}
                <View style={{ flexDirection: 'row', marginTop: 8 }}><PdfButton small path={`/api/shop/pdf/tailor/measures/${s.id}`} name={`mesures-${s.takenOn}.pdf`} label={t('tl.pdf.measures')} /></View>
              </Card>
            ))}</Stack>
          )}
        </>
      )}
      {edit && partyId ? <SheetForm partyId={partyId} memberId={who} memberName={person?.name ?? party?.name} base={cur.data} onClose={() => setEdit(false)} onSaved={(queued) => { setEdit(false); toast(queued ? t('tl.queuedShort') : t('tl.sheetSaved')); void list.reload(); void cur.reload(); }} /> : null}
    </Screen>
  );
}
