import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/form';
import { Badge, Card, Hint, SectionTitle } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';

type Option = { value: string; label: string; description?: string | null; enables?: string[] };
type Question = {
  code: string;
  step?: string;
  type: 'SINGLE_CHOICE' | 'MULTI_CHOICE';
  text: string;
  help: string;
  required?: boolean;
  showIf: { question: string; in: string[] } | null;
  options: Option[];
};
type Step = { code: string; title: string; subtitle: string; questions: Question[] };
type PackStep = { code: string; title: string; subtitle?: string | null };
type Feature = { code: string; name: string; price: number };
type Questionnaire = { steps: Step[]; currency: string; features?: Feature[] };
type Pack = { packCode: string; title: string; subtitle: string; replacesGeneric?: boolean; steps?: PackStep[]; questions: Question[] };
type Quote = { currency: string; total: number };
const CATEGORY_QUESTION: Record<string, string> = { RETAIL: 'retail_category', WHOLESALE: 'wholesale_category', SERVICES: 'service_category', MIXED: 'mixed_category' };
type Answers = Record<string, string | string[]>;

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  CM: 'XAF', SN: 'XOF', CI: 'XOF', GA: 'XAF', CG: 'XAF', CD: 'CDF', BJ: 'XOF', TG: 'XOF',
  BF: 'XOF', ML: 'XOF', NE: 'XOF', TD: 'XAF', CF: 'XAF', GQ: 'XAF', NG: 'NGN', GH: 'GHS',
  MA: 'MAD', DZ: 'DZD', TN: 'TND', FR: 'EUR', ES: 'EUR', US: 'USD',
};

function isVisible(question: Question, answers: Answers) {
  if (!question.showIf) return true;
  const answer = answers[question.showIf.question];
  const values = Array.isArray(answer) ? answer : answer ? [answer] : [];
  return question.showIf.in.some((value) => values.includes(value));
}

export default function OnboardingScreen() {
  // ouvert depuis une enseigne ("Ajouter un site") : le nouveau site lui est rattache
  const { organization } = useLocalSearchParams<{ organization?: string }>();
  const { t, lang: language, formatMoney } = useT();
  const theme = useTheme();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [pack, setPack] = useState<Pack | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packAnswers, setPackAnswers] = useState<Answers>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [shopName, setShopName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('CM');
  const [currency, setCurrency] = useState('XAF');
  const [currencyChosen, setCurrencyChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<Questionnaire>(`/api/public/onboarding?lang=${language}`, { auth: false })
      .then((data) => active && setQuestionnaire(data))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : t('shop.loadError')));
    return () => {
      active = false;
    };
  }, [language, t]);

  // Questionnaire du metier : charge des que le modele ET la specialite sont connus (204 = aucun)
  const kind = typeof answers.business_kind === 'string' ? answers.business_kind : undefined;
  const categoryAnswer = kind ? answers[CATEGORY_QUESTION[kind]] : undefined;
  const category = typeof categoryAnswer === 'string' ? categoryAnswer : undefined;
  useEffect(() => {
    let active = true;
    if (!kind || !category) {
      Promise.resolve().then(() => {
        if (!active) return;
        setPack(null);
        setPackLoading(false);
      });
      return () => { active = false; };
    }
    Promise.resolve().then(() => active && setPackLoading(true));
    api<Pack | undefined>(`/api/public/onboarding/pack?category=${encodeURIComponent(category)}&model=${encodeURIComponent(kind)}&lang=${language}`, { auth: false })
      .then((data) => active && setPack(data && data.questions?.length ? data : null))
      .catch(() => active && setPack(null))
      .finally(() => active && setPackLoading(false));
    return () => {
      active = false;
    };
  }, [kind, category, language]);

  const packVisible = useMemo(() => (pack ? pack.questions.filter((question) => isVisible(question, packAnswers)) : []), [pack, packAnswers]);
  const packPayload = useMemo(() => {
    if (!pack) return undefined;
    const out: Answers = {};
    packVisible.forEach((question) => {
      const value = packAnswers[question.code];
      if (value !== undefined) out[question.code] = value;
      else if (question.type === 'MULTI_CHOICE') out[question.code] = [];
    });
    return out;
  }, [pack, packVisible, packAnswers]);
  const featureByCode = useMemo(() => Object.fromEntries((questionnaire?.features ?? []).map((feature) => [feature.code, feature])), [questionnaire]);

  // Prix recalcule en direct avec les reponses du metier
  useEffect(() => {
    if (!packPayload) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      api<{ estimate: Quote }>('/api/public/onboarding/estimate', { method: 'POST', auth: false, body: { answers, packAnswers: packPayload } })
        .then((data) => active && setQuote(data.estimate))
        .catch(() => undefined);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [answers, packPayload]);

  const genericSteps = useMemo(
    () => (questionnaire?.steps ?? [])
      .map((step) => ({
        ...step,
        questions: step.questions.filter((question) => isVisible(question, answers)
          && (!pack?.replacesGeneric || question.code === 'business_kind' || question.code === CATEGORY_QUESTION[kind ?? ''])),
      }))
      .filter((step) => step.questions.length > 0),
    [answers, questionnaire, pack, kind],
  );
  const packSteps = useMemo(() => {
    if (!pack) return [];
    const definitions = pack.steps?.length ? pack.steps : [{ code: 'setup', title: pack.title, subtitle: pack.subtitle }];
    return definitions
      .map((step) => ({ ...step, questions: packVisible.filter((question) => (question.step ?? 'setup') === step.code) }))
      .filter((step) => step.questions.length > 0);
  }, [pack, packVisible]);
  const total = genericSteps.length + 1 + packSteps.length;
  const packStepIndex = stepIndex - 1 - genericSteps.length;
  const packStep = packStepIndex >= 0 && packStepIndex < packSteps.length;
  const current = stepIndex === 0 || packStep ? null : genericSteps[stepIndex - 1];
  const currentPackStep = packStep ? packSteps[packStepIndex] : null;
  const lastStep = stepIndex === total - 1;
  const waitingForPack = Boolean(kind && category && packLoading);
  const complete = stepIndex === 0
    ? shopName.trim().length >= 2 && /^[A-Za-z]{2}$/.test(country.trim()) && /^[A-Za-z]{3}$/.test(currency.trim())
    : packStep
      ? currentPackStep?.questions.every((question) => !question.required || (Array.isArray(packAnswers[question.code]) ? packAnswers[question.code].length > 0 : typeof packAnswers[question.code] === 'string')) ?? false
      : current?.questions.every((question) => question.type === 'MULTI_CHOICE' || typeof answers[question.code] === 'string') ?? false;

  function choosePack(question: Question, value: string) {
    setPackAnswers((previous) => {
      if (question.type !== 'MULTI_CHOICE') return { ...previous, [question.code]: value };
      const previousAnswer = previous[question.code];
      const selected: string[] = Array.isArray(previousAnswer) ? previousAnswer : [];
      return { ...previous, [question.code]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] };
    });
  }

  function choose(question: Question, value: string) {
    // un autre metier = un autre questionnaire : on repart de zero
    if (question.code === 'business_kind' || question.code.endsWith('_category')) setPackAnswers({});
    setAnswers((previous) => {
      if (question.type !== 'MULTI_CHOICE') {
        const next = { ...previous, [question.code]: value };
        // Une nouvelle activité invalide la catégorie et la configuration métier
        // précédentes. On évite ainsi d'envoyer le profil d'un salon à une boutique.
        if (question.code === 'business_kind') {
          Object.keys(next).forEach((code) => {
            if (code.endsWith('_category') || code.startsWith('profile_')) delete next[code];
          });
          next.business_kind = value;
        } else if (question.code.endsWith('_category')) {
          Object.keys(next).forEach((code) => {
            if (code.startsWith('profile_')) delete next[code];
          });
        }
        return next;
      }
      const previousAnswer = previous[question.code];
      const selected: string[] = Array.isArray(previousAnswer) ? previousAnswer : [];
      return {
        ...previous,
        [question.code]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
      };
    });
  }

  async function createShop() {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const visibleCodes = new Set(genericSteps.flatMap((step) => step.questions.map((question) => question.code)));
      const payload: Answers = Object.fromEntries(Object.entries(answers).filter(([code]) => visibleCodes.has(code)));
      genericSteps.flatMap((step) => step.questions)
        .filter((question) => question.type === 'MULTI_CHOICE' && !payload[question.code])
        .forEach((question) => {
          payload[question.code] = [];
        });
      const countryCode = country.trim().toUpperCase();
      await api('/api/merchant/shops', {
        method: 'POST',
        body: {
          name: shopName.trim(),
          city: city.trim(),
          country: countryCode,
          currency: currency.trim().toUpperCase(),
          ...(organization ? { organizationId: organization } : {}),
          answers: payload,
          ...(packPayload ? { packAnswers: packPayload } : {}),
        },
      });
      router.replace('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('shop.createError'));
    } finally {
      setBusy(false);
    }
  }

  if (!questionnaire && !error) {
    return <ThemedView style={styles.center}><ActivityIndicator size="large" /><ThemedText>{t('shop.preparing')}</ThemedText></ThemedView>;
  }
  if (!questionnaire) {
    return <ThemedView style={styles.center}><ThemedText style={{ color: theme.danger }}>{error}</ThemedText><Button title={t('common.back')} onPress={() => router.back()} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: stepIndex + 1 }}>
            <View style={[styles.progressValue, { width: `${((stepIndex + 1) / total) * 100}%`, backgroundColor: theme.primary }]} />
          </View>
          <ThemedText themeColor="textSecondary">{t('mob.onb.stepOf', { current: stepIndex + 1, total })}</ThemedText>

          {stepIndex === 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{t('shop.title')}</ThemedText>
              <ThemedText themeColor="textSecondary">{t('shop.subtitle')}</ThemedText>
              <TextField label={t('shop.name')} value={shopName} onChangeText={setShopName} autoCapitalize="words" maxLength={100} />
              <TextField label={t('shop.city')} value={city} onChangeText={setCity} autoCapitalize="words" textContentType="addressCity" />
              <TextField label={t('shop.country')} value={country} onChangeText={(value) => {
                const code = value.toUpperCase();
                setCountry(code);
                if (!currencyChosen && CURRENCY_BY_COUNTRY[code]) setCurrency(CURRENCY_BY_COUNTRY[code]);
              }} autoCapitalize="characters" maxLength={2} />
              <TextField label={t('shop.currency')} value={currency} onChangeText={(value) => { setCurrencyChosen(true); setCurrency(value.toUpperCase()); }} autoCapitalize="characters" maxLength={3} />
            </View>
          ) : packStep && pack && currentPackStep ? (
            <View style={styles.section}>
              <ThemedText type="subtitle">{currentPackStep.title}</ThemedText>
              {currentPackStep.subtitle ? <ThemedText themeColor="textSecondary">{currentPackStep.subtitle}</ThemedText> : null}
              {currentPackStep.questions.map((question) => (
                <View key={question.code} style={styles.question}>
                  <ThemedText type="smallBold">{question.text}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {question.help}{question.type === 'MULTI_CHOICE' ? ` · ${t('mob.onb.multi')}` : ''}
                  </ThemedText>
                  {question.options.map((option) => {
                    const answer = packAnswers[question.code];
                    const selected = Array.isArray(answer) ? answer.includes(option.value) : answer === option.value;
                    const unlocks = (option.enables ?? []).map((code) => featureByCode[code]?.name).filter(Boolean);
                    const color = selected ? { color: theme.primaryText } : undefined;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole={question.type === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                        accessibilityState={{ checked: selected }}
                        onPress={() => choosePack(question, option.value)}
                        style={[styles.option, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                        <ThemedText style={selected ? { color: theme.primaryText, fontWeight: '700' } : undefined}>{option.label}</ThemedText>
                        {option.description ? <ThemedText type="small" themeColor="textSecondary" style={color}>{option.description}</ThemedText> : null}
                        {unlocks.length > 0 ? <ThemedText type="small" themeColor="textSecondary" style={color}>{t('mob.onb.activates')} : {unlocks.join(', ')}</ThemedText> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {packStepIndex === packSteps.length - 1 ? <PackRecap pack={pack} packAnswers={packAnswers} featureByCode={featureByCode} /> : null}
              {quote ? (
                <Card>
                  <SectionTitle title={t('mob.onb.estimate')} hint={t('mob.onb.estimateHint')} />
                  <ThemedText type="subtitle">{formatMoney(quote.total, quote.currency)} {t('common.perMonth')}</ThemedText>
                </Card>
              ) : null}
            </View>
          ) : (
            <View style={styles.section}>
              <ThemedText type="subtitle">{current?.title}</ThemedText>
              <ThemedText themeColor="textSecondary">{current?.subtitle}</ThemedText>
              {current?.questions.map((question) => (
                <View key={question.code} style={styles.question}>
                  <ThemedText type="smallBold">{question.text}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{question.help}</ThemedText>
                  {question.options.map((option) => {
                    const answer = answers[question.code];
                    const selected = Array.isArray(answer) ? answer.includes(option.value) : answer === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole={question.type === 'MULTI_CHOICE' ? 'checkbox' : 'radio'}
                        accessibilityState={{ checked: selected }}
                        onPress={() => choose(question, option.value)}
                        style={[styles.option, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                        <ThemedText style={selected ? { color: theme.primaryText, fontWeight: '700' } : undefined}>{option.label}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
          <View style={styles.navigation}>
            {stepIndex === 0 ? <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} /> : <Button title={t('common.back')} variant="secondary" onPress={() => setStepIndex((index) => index - 1)} />}
            {lastStep ? <Button title={t('shop.create')} loading={busy} disabled={!complete || waitingForPack} onPress={createShop} /> : <Button title={t('common.next')} disabled={!complete || waitingForPack} onPress={() => setStepIndex((index) => index + 1)} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Fonctionnalites activees par les reponses du metier + rappel que tout reste modifiable. */
function PackRecap({ pack, packAnswers, featureByCode }: { pack: Pack; packAnswers: Answers; featureByCode: Record<string, Feature> }) {
  const { t } = useT();
  const codes = new Set<string>();
  pack.questions.forEach((question) => {
    if (!isVisible(question, packAnswers)) return;
    const given = packAnswers[question.code];
    const values = Array.isArray(given) ? given : given ? [given] : [];
    question.options.filter((option) => values.includes(option.value)).forEach((option) => (option.enables ?? []).forEach((code) => codes.add(code)));
  });
  const features = [...codes].map((code) => featureByCode[code]).filter(Boolean);
  return (
    <Card tone="primary">
      <SectionTitle title={t('wizard.pack.recapTitle')} />
      {features.length > 0 ? (
        <View style={styles.chips}>{features.map((feature) => <Badge key={feature.code} tone="primary">{feature.name}</Badge>)}</View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">{t('wizard.pack.recapNone')}</ThemedText>
      )}
      <Hint icon="circle-info">{t('wizard.pack.later')}</Hint>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  section: { gap: Spacing.three },
  question: { gap: Spacing.two, marginTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  option: { borderWidth: 1, borderRadius: 12, padding: Spacing.three },
  navigation: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', marginTop: Spacing.two },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: 4 },
  progressValue: { height: '100%', borderRadius: 4 },
});
