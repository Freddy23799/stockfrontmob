import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PdfButton } from '@/components/pdf-button';
import { ThemedText } from '@/components/themed-text';
import { Badge, Btn, Card, Chips, Empty, ErrorNote, Hint, Row, Screen, SectionTitle, Sheet, Skeleton, Stack, TextBox, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { qs, useQuery } from '@/lib/query';
import { useShop } from '@/lib/shop';
import type { PageProps } from '../registry';

const API = '/api/shop/salon';
const KINDS = ['NOTE', 'FORMULA', 'HEALTH', 'PREFERENCE'];
type File = { partyId: string; partyName: string; phone?: string | null; allergies?: string | null; contraindications?: string | null; skinType?: string | null; hairType?: string | null; preferences?: string | null; alert: boolean };
type Note = { id: string; kind: string; title?: string | null; body: string; createdAt: string };
type ClientCard = { file: File | null; notes: { items: Note[]; total: number } | null; visits: { id: string; startsAt: string; status: string; stylistName?: string | null; services: { name: string }[] }[]; packages: { items: { id: string; name: string; sessionsLeft: number; sessionsTotal: number; expiresOn?: string | null }[] } | null };
type Party = { id: string; name: string; phone?: string | null };
type Listing = { items: Party[]; total: number };

function Detail({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const shop = useShop();
  const toast = useToast();
  const q = useQuery<ClientCard>(`${API}/clients/${partyId}/card`);
  const [saved, setSaved] = useState<File | null>(null);
  const [edits, setEdits] = useState<Partial<File>>({});
  const [added, setAdded] = useState<Note[]>([]);
  const [draft, setDraft] = useState({ kind: 'NOTE', title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = shop.can('CLIENT_FILE', 'update');
  const base = saved ?? q.data?.file ?? null;
  const file = base ? { ...base, ...edits } : null;
  const notes = [...added, ...(q.data?.notes?.items ?? []).filter((n) => !added.some((a) => a.id === n.id))];
  const err = (e: unknown) => setError(e instanceof ApiError ? e.message : t('common.network'));
  const set = (k: keyof File) => (v: string) => setEdits((e) => ({ ...e, [k]: v }));

  async function saveFile() {
    setBusy(true); setError(null);
    try { setSaved(await shop.call<File>(`${API}/clients/${partyId}/file`, { method: 'PUT', body: file })); setEdits({}); toast(t('sl.saved')); } catch (e) { err(e); } finally { setBusy(false); }
  }
  async function addNote() {
    setBusy(true); setError(null);
    try { const n = await shop.call<Note>(`${API}/clients/${partyId}/notes`, { method: 'POST', body: draft }); setAdded((a) => [n, ...a]); setDraft({ ...draft, title: '', body: '' }); } catch (e) { err(e); } finally { setBusy(false); }
  }
  return (
    <Sheet visible title={q.data?.file?.partyName ?? t('sl.clientFile')} onClose={onClose} tall>
      {!q.data || !file ? (q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <Skeleton rows={4} />) : (
        <View style={{ gap: 12 }}>
          {error ? <Hint tone="danger">{error}</Hint> : null}
          {file.alert ? <Hint tone="warning" icon="triangle-exclamation" title={t('sl.alertTitle')}>{[file.allergies && `${t('sl.allergies')} : ${file.allergies}`, file.contraindications && `${t('sl.contraindications')} : ${file.contraindications}`].filter(Boolean).join('\n')}</Hint> : null}
          <PdfButton path={`/api/shop/pdf/salon/clients/${partyId}`} name={`fiche-${file.partyName}.pdf`} label={t('sl.pdf.client')} small />
          <SectionTitle title={t('sl.profile')} />
          <TextBox label={t('sl.allergies')} value={file.allergies ?? ''} onChangeText={set('allergies')} editable={canEdit} maxLength={1000} />
          <TextBox label={t('sl.contraindications')} value={file.contraindications ?? ''} onChangeText={set('contraindications')} editable={canEdit} maxLength={1000} hint={t('sl.contraHint')} />
          <TextBox label={t('sl.skinType')} value={file.skinType ?? ''} onChangeText={set('skinType')} editable={canEdit} maxLength={120} />
          <TextBox label={t('sl.hairType')} value={file.hairType ?? ''} onChangeText={set('hairType')} editable={canEdit} maxLength={120} />
          <TextBox label={t('sl.preferences')} value={file.preferences ?? ''} onChangeText={set('preferences')} editable={canEdit} maxLength={1000} />
          {canEdit ? <Btn title={t('common.save')} loading={busy} onPress={() => void saveFile()} /> : null}
          <SectionTitle title={t('sl.history')} />
          {shop.can('CLIENT_FILE', 'create') ? (
            <Card>
              <Chips scroll={false} value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KINDS.map((k) => ({ value: k, label: t(`sl.note.${k}`) }))} />
              <TextBox label={t('sl.noteTitle')} value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} maxLength={120} />
              <TextBox label={t('sl.noteBody')} value={draft.body} onChangeText={(v) => setDraft({ ...draft, body: v })} multiline maxLength={4000} placeholder={draft.kind === 'FORMULA' ? t('sl.formulaHint') : ''} />
              <Btn small icon="plus" title={t('sl.addNote')} disabled={busy || !draft.body.trim()} onPress={() => void addNote()} />
            </Card>
          ) : null}
          {notes.length === 0 ? <ThemedText themeColor="textSecondary">{t('sl.noNotes')}</ThemedText> : notes.map((n) => (
            <Card key={n.id}><ThemedText type="smallBold">{n.title || t(`sl.note.${n.kind}`)}</ThemedText><Badge tone={n.kind === 'HEALTH' ? 'danger' : 'info'}>{t(`sl.note.${n.kind}`)}</Badge><ThemedText>{n.body}</ThemedText><ThemedText type="small" themeColor="textSecondary">{formatDateTime(n.createdAt, lang)}</ThemedText></Card>
          ))}
          {q.data.packages && q.data.packages.items.length > 0 ? <><SectionTitle title={t('sl.packages')} />{q.data.packages.items.map((p) => <Row key={p.id} title={p.name} subtitle={t('sl.sessionsLeft', { left: p.sessionsLeft, total: p.sessionsTotal })} meta={p.expiresOn ? t('sl.expires', { date: p.expiresOn }) : undefined} />)}</> : null}
          {q.data.visits.length > 0 ? <><SectionTitle title={t('sl.visits')} />{q.data.visits.map((v) => <Row key={v.id} title={formatDateTime(v.startsAt, lang)} subtitle={`${v.services.map((s) => s.name).join(', ')}${v.stylistName ? ` · ${v.stylistName}` : ''}`} meta={<Badge tone={v.status === 'DONE' ? 'success' : 'info'}>{t(`sl.st.${v.status}`)}</Badge>} />)}</> : null}
        </View>
      )}
    </Sheet>
  );
}

/** Fiches clients du salon : allergies, contre-indications, formules de couleur, historique des soins. */
export default function SalonClients({ item, tab }: PageProps) {
  const { t } = useT();
  const shop = useShop();
  const params = useLocalSearchParams<{ party?: string }>();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(typeof params.party === 'string' ? params.party : null);
  const list = useQuery<Listing>(`/api/shop/parties${qs({ role: 'CUSTOMER', q: search.trim(), size: 30 })}`, { debounce: 300 });
  return (
    <Screen tabs={tab} title={shop.tr(item.label)} onRefresh={list.reload}>
      <TextBox label={t('sl.searchClient')} value={search} onChangeText={setSearch} autoCapitalize="none" />
      {list.error && !list.data ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {!list.data ? <Skeleton rows={4} /> : list.data.items.length === 0 ? <Empty icon="users" title={t('sl.noClient')} text={t('sl.noClientText')} /> : (
        <Stack gap={6}>{list.data.items.map((c) => <Row key={c.id} icon="id-card" title={c.name} subtitle={c.phone ?? undefined} chevron onPress={() => setOpen(c.id)} />)}</Stack>
      )}
      {open ? <Detail partyId={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}
