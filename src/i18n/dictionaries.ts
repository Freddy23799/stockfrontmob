export type Lang = 'fr' | 'en' | 'es';

/** Textes de l'application mobile. Les pluriels utilisent les suffixes _one / _other avec {count}. */
const fr = {
  'common.loading': 'Chargement…', 'common.retry': 'Réessayer', 'common.cancel': 'Annuler', 'common.back': 'Retour',
  'common.next': 'Continuer', 'common.logout': 'Se déconnecter', 'common.optional': 'facultatif', 'common.perMonth': '/ mois',
  'common.error': 'Une erreur est survenue. Réessayez.', 'common.network': 'Impossible de joindre le serveur. Vérifiez votre connexion.',

  'welcome.skip': 'Passer', 'welcome.next': 'Suivant', 'welcome.start': 'Commencer', 'welcome.haveAccount': 'J’ai déjà un compte',
  'welcome.1.title': 'Votre boutique, enfin sous contrôle', 'welcome.1.text': 'Stock, ventes, clients et dettes réunis dans une seule application, simple à utiliser.',
  'welcome.2.title': 'Neuf questions, et c’est prêt', 'welcome.2.text': 'Répondez à quelques questions sur votre commerce : Vylaxo construit tout seul l’espace qui vous correspond.',
  'welcome.3.title': 'Même sans internet', 'welcome.3.text': 'Le réseau coupe ? La vente continue. Tout se synchronise dès que la connexion revient.',
  'welcome.4.title': 'Un prix juste, 15 jours offerts', 'welcome.4.text': 'Vous ne payez que les fonctionnalités que vous utilisez. Essayez gratuitement pendant 15 jours.',

  'login.title': 'Connexion', 'login.subtitle': 'Connectez-vous pour gérer vos boutiques.', 'login.identifier': 'E-mail, téléphone ou nom d’utilisateur',
  'login.password': 'Mot de passe', 'login.submit': 'Se connecter', 'login.google': 'Continuer avec Google', 'login.or': 'ou',
  'login.noAccount': 'Pas encore de compte ? Créer ma boutique',
  'register.title': 'Créer mon compte', 'register.subtitle': 'Vous configurerez ensuite votre boutique en quelques questions.', 'register.fullName': 'Nom complet',
  'register.identifier': 'E-mail ou téléphone', 'register.password': 'Mot de passe (8 caractères minimum)', 'register.submit': 'Créer mon compte',
  'register.haveAccount': 'Déjà un compte ? Se connecter',

  'profile.title': 'Parlez-nous un peu de vous', 'profile.subtitle': 'Dernière étape avant de créer votre boutique. Ces informations restent privées.',
  'profile.fullName': 'Votre nom', 'profile.phone': 'Numéro de téléphone', 'profile.phoneHint': 'Pour vous joindre et sécuriser votre compte. La connexion par SMS arrive bientôt.', 'profile.phoneInvalid': 'Entrez un numéro valide pour le pays sélectionné.',
  'profile.country': 'Pays', 'profile.city': 'Ville', 'profile.heard': 'Comment avez-vous connu Vylaxo ?', 'profile.chooseCountry': 'Choisir un pays',
  'profile.heard.FRIEND': 'Un ami ou un proche', 'profile.heard.SOCIAL': 'Les réseaux sociaux', 'profile.heard.SEARCH': 'Une recherche internet',
  'profile.heard.AD': 'Une publicité', 'profile.heard.OTHER': 'Autre', 'profile.submit': 'Continuer',

  'home.hello': 'Bonjour {name}', 'home.subtitle': 'Gérez vos boutiques depuis cet espace.', 'home.offline': 'Mode hors ligne : vos données seront synchronisées à la reconnexion.',
  'home.empty.title': 'Créez votre premier espace', 'home.empty.text': 'Répondez à quelques questions : nous préparons un espace de gestion sur mesure pour votre commerce.',
  'home.empty.cta': 'Créer mon premier espace', 'home.new': 'Nouvelle boutique', 'home.loadError': 'Impossible de charger vos boutiques.',
  'home.trial_one': 'Essai · {count} jour restant', 'home.trial_other': 'Essai · {count} jours restants',
  'state.ACTIVE': 'Abonnement actif', 'state.PAST_DUE': 'Paiement en retard', 'state.EXPIRED': 'Terminé · lecture seule', 'state.SUSPENDED': 'Suspendu',

  'account.title': 'Mon compte', 'account.language': 'Langue', 'account.contact': 'Nous contacter', 'account.developedBy': 'Développé par',
  'account.address': 'Bafoussam, Marché B, Ouest Cameroun',
  'account.theme': 'Thème', 'theme.system': 'Appareil', 'theme.light': 'Clair', 'theme.dark': 'Sombre',

  'tabs.shops': 'Boutiques', 'tabs.account': 'Compte',

  'shop.title': 'Parlons de votre boutique', 'shop.subtitle': 'Ces informations permettent de préparer votre espace de gestion.', 'shop.name': 'Nom de la boutique',
  'shop.city': 'Ville (facultatif)', 'shop.country': 'Code pays (ex. CM)', 'shop.currency': 'Devise (code, ex. XAF)',  'shop.create': 'Créer ma boutique', 'shop.preparing': 'Préparation de votre espace…',
  'shop.loadError': 'Impossible de charger le questionnaire.', 'shop.createError': 'Impossible de créer votre boutique.',
};

const en: typeof fr = {
  'common.loading': 'Loading…', 'common.retry': 'Try again', 'common.cancel': 'Cancel', 'common.back': 'Back',
  'common.next': 'Continue', 'common.logout': 'Sign out', 'common.optional': 'optional', 'common.perMonth': '/ month',
  'common.error': 'Something went wrong. Please try again.', 'common.network': 'Cannot reach the server. Check your connection.',

  'welcome.skip': 'Skip', 'welcome.next': 'Next', 'welcome.start': 'Get started', 'welcome.haveAccount': 'I already have an account',
  'welcome.1.title': 'Your shop, finally under control', 'welcome.1.text': 'Stock, sales, customers and debts in one simple app.',
  'welcome.2.title': 'Nine questions and you’re set', 'welcome.2.text': 'Answer a few questions about your business: Vylaxo builds the space that fits you, all by itself.',
  'welcome.3.title': 'Even without internet', 'welcome.3.text': 'Network down? Selling goes on. Everything syncs as soon as you’re back online.',
  'welcome.4.title': 'A fair price, 15 days free', 'welcome.4.text': 'You only pay for the features you use. Try it free for 15 days.',

  'login.title': 'Sign in', 'login.subtitle': 'Sign in to manage your shops.', 'login.identifier': 'Email, phone or username',
  'login.password': 'Password', 'login.submit': 'Sign in', 'login.google': 'Continue with Google', 'login.or': 'or',
  'login.noAccount': 'No account yet? Create my shop',
  'register.title': 'Create my account', 'register.subtitle': 'You’ll then set up your shop in a few questions.', 'register.fullName': 'Full name',
  'register.identifier': 'Email or phone', 'register.password': 'Password (at least 8 characters)', 'register.submit': 'Create my account',
  'register.haveAccount': 'Already have an account? Sign in',

  'profile.title': 'Tell us a little about yourself', 'profile.subtitle': 'Last step before creating your shop. This information stays private.',
  'profile.fullName': 'Your name', 'profile.phone': 'Phone number', 'profile.phoneHint': 'To reach you and secure your account. SMS sign-in is coming soon.', 'profile.phoneInvalid': 'Enter a valid number for the selected country.',
  'profile.country': 'Country', 'profile.city': 'City', 'profile.heard': 'How did you hear about Vylaxo?', 'profile.chooseCountry': 'Choose a country',
  'profile.heard.FRIEND': 'A friend or relative', 'profile.heard.SOCIAL': 'Social media', 'profile.heard.SEARCH': 'An internet search',
  'profile.heard.AD': 'An advertisement', 'profile.heard.OTHER': 'Other', 'profile.submit': 'Continue',

  'home.hello': 'Hello {name}', 'home.subtitle': 'Manage your shops from here.', 'home.offline': 'Offline mode: your data will sync when you reconnect.',
  'home.empty.title': 'Create your first space', 'home.empty.text': 'Answer a few questions: we prepare a management space tailored to your business.',
  'home.empty.cta': 'Create my first space', 'home.new': 'New shop', 'home.loadError': 'Could not load your shops.',
  'home.trial_one': 'Trial · {count} day left', 'home.trial_other': 'Trial · {count} days left',
  'state.ACTIVE': 'Active subscription', 'state.PAST_DUE': 'Payment overdue', 'state.EXPIRED': 'Ended · read-only', 'state.SUSPENDED': 'Suspended',

  'account.title': 'My account', 'account.language': 'Language', 'account.contact': 'Contact us', 'account.developedBy': 'Developed by',
  'account.address': 'Bafoussam, Marché B, West Region, Cameroon',
  'account.theme': 'Theme', 'theme.system': 'Device', 'theme.light': 'Light', 'theme.dark': 'Dark',

  'tabs.shops': 'Shops', 'tabs.account': 'Account',

  'shop.title': 'Let’s talk about your shop', 'shop.subtitle': 'This information helps prepare your management space.', 'shop.name': 'Shop name',
  'shop.city': 'City (optional)', 'shop.country': 'Country code (e.g. CM)', 'shop.currency': 'Currency (code, e.g. XAF)',  'shop.create': 'Create my shop', 'shop.preparing': 'Preparing your space…',
  'shop.loadError': 'Could not load the questionnaire.', 'shop.createError': 'Could not create your shop.',
};

const es: typeof fr = {
  'common.loading': 'Cargando…', 'common.retry': 'Reintentar', 'common.cancel': 'Cancelar', 'common.back': 'Volver',
  'common.next': 'Continuar', 'common.logout': 'Cerrar sesión', 'common.optional': 'opcional', 'common.perMonth': '/ mes',
  'common.error': 'Ha ocurrido un error. Inténtelo de nuevo.', 'common.network': 'No se puede conectar con el servidor. Compruebe su conexión.',

  'welcome.skip': 'Omitir', 'welcome.next': 'Siguiente', 'welcome.start': 'Empezar', 'welcome.haveAccount': 'Ya tengo una cuenta',
  'welcome.1.title': 'Su tienda, por fin bajo control', 'welcome.1.text': 'Inventario, ventas, clientes y deudas en una sola aplicación, fácil de usar.',
  'welcome.2.title': 'Nueve preguntas y listo', 'welcome.2.text': 'Responda unas preguntas sobre su negocio: Vylaxo construye solo el espacio que le corresponde.',
  'welcome.3.title': 'Incluso sin internet', 'welcome.3.text': '¿Se cae la red? La venta continúa. Todo se sincroniza en cuanto vuelve la conexión.',
  'welcome.4.title': 'Un precio justo, 15 días gratis', 'welcome.4.text': 'Solo paga las funciones que usa. Pruebe gratis durante 15 días.',

  'login.title': 'Iniciar sesión', 'login.subtitle': 'Inicie sesión para gestionar sus tiendas.', 'login.identifier': 'Correo, teléfono o nombre de usuario',
  'login.password': 'Contraseña', 'login.submit': 'Iniciar sesión', 'login.google': 'Continuar con Google', 'login.or': 'o',
  'login.noAccount': '¿Aún sin cuenta? Crear mi tienda',
  'register.title': 'Crear mi cuenta', 'register.subtitle': 'Después configurará su tienda con unas preguntas.', 'register.fullName': 'Nombre completo',
  'register.identifier': 'Correo o teléfono', 'register.password': 'Contraseña (mínimo 8 caracteres)', 'register.submit': 'Crear mi cuenta',
  'register.haveAccount': '¿Ya tiene cuenta? Iniciar sesión',

  'profile.title': 'Cuéntenos un poco sobre usted', 'profile.subtitle': 'Último paso antes de crear su tienda. Esta información es privada.',
  'profile.fullName': 'Su nombre', 'profile.phone': 'Número de teléfono', 'profile.phoneHint': 'Para contactarle y proteger su cuenta. El inicio de sesión por SMS llegará pronto.', 'profile.phoneInvalid': 'Introduzca un número válido para el país seleccionado.',
  'profile.country': 'País', 'profile.city': 'Ciudad', 'profile.heard': '¿Cómo conoció Vylaxo?', 'profile.chooseCountry': 'Elegir un país',
  'profile.heard.FRIEND': 'Un amigo o familiar', 'profile.heard.SOCIAL': 'Redes sociales', 'profile.heard.SEARCH': 'Una búsqueda en internet',
  'profile.heard.AD': 'Un anuncio', 'profile.heard.OTHER': 'Otro', 'profile.submit': 'Continuar',

  'home.hello': 'Hola {name}', 'home.subtitle': 'Gestione sus tiendas desde aquí.', 'home.offline': 'Modo sin conexión: sus datos se sincronizarán al reconectarse.',
  'home.empty.title': 'Cree su primer espacio', 'home.empty.text': 'Responda unas preguntas: preparamos un espacio de gestión a la medida de su negocio.',
  'home.empty.cta': 'Crear mi primer espacio', 'home.new': 'Nueva tienda', 'home.loadError': 'No se pudieron cargar sus tiendas.',
  'home.trial_one': 'Prueba · queda {count} día', 'home.trial_other': 'Prueba · quedan {count} días',
  'state.ACTIVE': 'Suscripción activa', 'state.PAST_DUE': 'Pago atrasado', 'state.EXPIRED': 'Terminada · solo lectura', 'state.SUSPENDED': 'Suspendida',

  'account.title': 'Mi cuenta', 'account.language': 'Idioma', 'account.contact': 'Contáctenos', 'account.developedBy': 'Desarrollado por',
  'account.address': 'Bafoussam, Marché B, Región Oeste, Camerún',
  'account.theme': 'Tema', 'theme.system': 'Dispositivo', 'theme.light': 'Claro', 'theme.dark': 'Oscuro',

  'tabs.shops': 'Tiendas', 'tabs.account': 'Cuenta',

  'shop.title': 'Hablemos de su tienda', 'shop.subtitle': 'Esta información sirve para preparar su espacio de gestión.', 'shop.name': 'Nombre de la tienda',
  'shop.city': 'Ciudad (opcional)', 'shop.country': 'Código de país (ej. CM)', 'shop.currency': 'Moneda (código, ej. XAF)',  'shop.create': 'Crear mi tienda', 'shop.preparing': 'Preparando su espacio…',
  'shop.loadError': 'No se pudo cargar el cuestionario.', 'shop.createError': 'No se pudo crear su tienda.',
};

export const DICTIONARIES: Record<Lang, Record<keyof typeof fr, string>> = { fr, en, es };
export type TextKey = keyof typeof fr;
export type PluralKey = 'home.trial';
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];
