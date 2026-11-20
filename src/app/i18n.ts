import type { Lang } from "./types";

export const T: Record<Lang, Record<string, string>> = {
  fr:{choose:'Choisissez votre alcool',drinks:'Boissons',about:'About',lang:'Langue',manager:'Manager',
      surprise:'Cocktail surprise',another:'Un autre',guestbook:"Livre d'or",gbName:'Votre prénom',gbMsg:'Votre message',
      send:'Envoyer',thanks:'Merci pour votre mot !',noMsg:'Soyez le premier à laisser un mot.',gbEmpty:'Écrivez un message.',
      empty:'Le bar se prépare. Revenez très vite.',error:'Connexion impossible. Réessayez.',loading:'Chargement…'},
  en:{choose:'Choose your spirit',drinks:'Drinks',about:'About',lang:'Language',manager:'Manager',
      surprise:'Surprise cocktail',another:'Another one',guestbook:'Guestbook',gbName:'Your name',gbMsg:'Your message',
      send:'Send',thanks:'Thank you for your message!',noMsg:'Be the first to leave a message.',gbEmpty:'Please write a message.',
      empty:'The bar is getting ready. Come back soon.',error:'Connection failed. Please try again.',loading:'Loading…'},
  he:{choose:'בחרו את האלכוהול',drinks:'משקאות',about:'אודות',lang:'שפה',manager:'ניהול',
      surprise:'קוקטייל הפתעה',another:'עוד אחד',guestbook:'ספר אורחים',gbName:'השם שלכם',gbMsg:'ההודעה שלכם',
      send:'שליחה',thanks:'תודה על ההודעה!',noMsg:'היו הראשונים להשאיר הודעה.',gbEmpty:'כתבו הודעה.',
      empty:'הבר מתכונן. חזרו בקרוב.',error:'אין חיבור. נסו שוב.',loading:'טוען…'}
};
export const ABOUT: Record<Lang, { title: string; p: string[] }> = {
  fr:{title:"L'histoire derrière le bar",p:[
    "Je m'appelle David Kosman. Ma passion pour les cocktails est née dans le monde culinaire, et cela fait quatre ans que l'univers des bars fait partie de ma vie. Je me suis formé chez Zman Amiti, une école internationale de mixologie et de barman.",
    "Pour moi, chaque personne a un palais unique. Un goût, une odeur peuvent vous ramener à un souvenir qui n'appartient qu'à vous. Mon but est de vous faire voyager, chacun dans son propre monde.",
    "Mes préférés ? Une bonne margarita avec sa couronne de sel, ou un gin tonic classique."]},
  he:{title:"הסיפור שמאחורי הבר",p:[
    "קוראים לי דוד קוסמן. התשוקה שלי לקוקטיילים נולדה בעולם הקולינריה, וכבר ארבע שנים שעולם הברים הוא חלק מחיי. למדתי ב\"זמן אמיתי\", בית ספר בינלאומי למיקסולוגיה וברמנות.",
    "בעיניי, לכל אדם יש חך משלו. טעם או ריח יכולים להחזיר אתכם לזיכרון ששייך רק לכם. המטרה שלי היא לקחת כל אחד למסע, אל העולם הפרטי שלו.",
    "המועדפים שלי? מרגריטה טובה עם כתר של מלח, או ג'ין טוניק קלאסי."]},
  en:{title:"The story behind the bar",p:[
    "My name is David Kosman. My passion for cocktails was born in the culinary world, and for four years now, bars have been part of my life. I trained at Zman Amiti, an international school of mixology and bartending.",
    "To me, every person has a unique palate. A taste or a scent can take you back to a memory that belongs only to you. My goal is to take each of you on a journey into a world of your own.",
    "My favourites? A good margarita with its crown of salt, or a classic gin and tonic."]}
};

export const tr = (lang: Lang, k: string) => T[lang]?.[k] || T.fr[k] || k;
export const BAR = "Au Bar de ce Soir";
