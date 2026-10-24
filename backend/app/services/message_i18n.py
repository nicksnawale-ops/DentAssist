"""Hindi and Marathi versions of WhatsApp messages.

Placeholders keep the same numbers and the same order as the English template, because each
language is submitted to Meta as a translation of the same template name.
"""

from datetime import datetime

# Patient preference (as saved on the patient record) -> WhatsApp language code
LANGUAGE_CODES = {"english": "en", "hindi": "hi", "marathi": "mr"}
LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
SUPPORTED = ("en", "hi", "mr")

TEMPLATE_TRANSLATIONS: dict[str, dict[str, str]] = {
    "appointment_reminder": {
        "hi": "नमस्ते {{1}}, {{2}} में आपका डेंटल अपॉइंटमेंट {{3}} को {{4}} बजे {{5}} के साथ है। "
              "पुष्टि के लिए CONFIRM, रद्द करने के लिए CANCEL या समय बदलने के लिए RESCHEDULE लिखें।",
        "mr": "नमस्कार {{1}}, {{2}} येथे तुमची डेंटल अपॉइंटमेंट {{3}} रोजी {{4}} वाजता {{5}} यांच्यासोबत आहे. "
              "निश्चित करण्यासाठी CONFIRM, रद्द करण्यासाठी CANCEL किंवा वेळ बदलण्यासाठी RESCHEDULE पाठवा.",
    },
    "reminder_24h": {
        "hi": "नमस्ते {{1}}, {{2}} में आपका डेंटल अपॉइंटमेंट कल, {{3}} को {{4}} बजे {{5}} के साथ है। "
              "पुष्टि के लिए CONFIRM, रद्द करने के लिए CANCEL या समय बदलने के लिए RESCHEDULE लिखें।",
        "mr": "नमस्कार {{1}}, {{2}} येथे तुमची डेंटल अपॉइंटमेंट उद्या, {{3}} रोजी {{4}} वाजता {{5}} यांच्यासोबत आहे. "
              "निश्चित करण्यासाठी CONFIRM, रद्द करण्यासाठी CANCEL किंवा वेळ बदलण्यासाठी RESCHEDULE पाठवा.",
    },
    "reminder_2h": {
        "hi": "नमस्ते {{1}}, जल्द मिलते हैं! {{2}} के साथ आपका अपॉइंटमेंट आज {{3}} बजे {{4}} में है।",
        "mr": "नमस्कार {{1}}, लवकरच भेटू! {{2}} यांच्यासोबत तुमची अपॉइंटमेंट आज {{3}} वाजता {{4}} येथे आहे.",
    },
    "booking_confirmation": {
        "hi": "नमस्ते {{1}}, {{2}} के साथ {{3}} में आपका अपॉइंटमेंट {{4}} को {{5}} बजे बुक हो गया है। "
              "पुष्टि के लिए CONFIRM लिखें, या न आ सकें तो CANCEL लिखें।",
        "mr": "नमस्कार {{1}}, {{2}} यांच्यासोबत {{3}} येथे तुमची अपॉइंटमेंट {{4}} रोजी {{5}} वाजता बुक झाली आहे. "
              "निश्चित करण्यासाठी CONFIRM पाठवा, किंवा येणे शक्य नसल्यास CANCEL पाठवा.",
    },
    "slot_offer": {
        "hi": "नमस्ते {{1}}, {{2}} के साथ जल्दी का एक अपॉइंटमेंट खाली हुआ है: {{3}} को {{4}} बजे। "
              "लेना हो तो YES लिखें। जो पहले जवाब देगा, उसे मिलेगा।",
        "mr": "नमस्कार {{1}}, {{2}} यांच्यासोबत लवकरची एक वेळ उपलब्ध झाली आहे: {{3}} रोजी {{4}} वाजता. "
              "हवी असल्यास YES पाठवा. जो आधी उत्तर देईल त्याला ही वेळ मिळेल.",
    },
    "invoice_issued": {
        "hi": "नमस्ते {{1}}, आपका बिल {{2}} ({{3}}) {{4}} से तैयार है, भुगतान की तारीख {{5}}। देखें और भुगतान करें: {{6}}",
        "mr": "नमस्कार {{1}}, तुमचे बिल {{2}} ({{3}}) {{4}} कडून तयार आहे, भरण्याची तारीख {{5}}. पाहा आणि पैसे भरा: {{6}}",
    },
    "payment_receipt": {
        "hi": "नमस्ते {{1}}, हमें {{2}} का भुगतान मिल गया है (बिल {{3}})। धन्यवाद!",
        "mr": "नमस्कार {{1}}, आम्हाला {{2}} चे पेमेंट मिळाले आहे (बिल {{3}}). धन्यवाद!",
    },
    "recall_checkup": {
        "hi": "नमस्ते {{1}}, {{2}} में आपकी नियमित डेंटल जाँच का समय हो गया है। "
              "अपनी सुविधा का समय बुक करें: {{3}} या BOOK लिखें, हम आपको कॉल करेंगे।",
        "mr": "नमस्कार {{1}}, {{2}} येथे तुमच्या नियमित डेंटल तपासणीची वेळ झाली आहे. "
              "तुमच्या सोयीची वेळ बुक करा: {{3}} किंवा BOOK पाठवा, आम्ही तुम्हाला कॉल करू.",
    },
    "recall_treatment": {
        "hi": "नमस्ते {{1}}, आपका उपचार ({{2}}, {{3}}) अभी पूरा नहीं हुआ है। इसे जल्दी पूरा करने से आगे की बड़ी "
              "समस्याओं से बचा जा सकता है। अगली विज़िट बुक करें: {{4}} या BOOK लिखें, हम आपको कॉल करेंगे।",
        "mr": "नमस्कार {{1}}, तुमचे उपचार ({{2}}, {{3}}) अजून पूर्ण झालेले नाहीत. ते लवकर पूर्ण केल्याने पुढील मोठ्या "
              "त्रासांपासून बचाव होतो. पुढची भेट बुक करा: {{4}} किंवा BOOK पाठवा, आम्ही तुम्हाला कॉल करू.",
    },
    "review_request": {
        "hi": "नमस्ते {{1}}, {{2}} आने के लिए धन्यवाद। अगर आप हमारी सेवा से खुश हैं, तो एक छोटा-सा Google रिव्यू "
              "दूसरों को हमें ढूँढने में मदद करता है: {{3}}",
        "mr": "नमस्कार {{1}}, {{2}} येथे भेट दिल्याबद्दल धन्यवाद. आमच्या सेवेने तुम्ही समाधानी असाल, तर एक छोटासा "
              "Google रिव्ह्यू इतरांना आम्हाला शोधायला मदत करतो: {{3}}",
    },
    "prescription_issued": {
        "hi": "नमस्ते {{1}}, {{2}} ({{3}}) ने आपका प्रिस्क्रिप्शन लिख दिया है। इसे यहाँ देखें और डाउनलोड करें: {{4}}",
        "mr": "नमस्कार {{1}}, {{2}} ({{3}}) यांनी तुमचे प्रिस्क्रिप्शन लिहिले आहे. ते इथे पाहा आणि डाउनलोड करा: {{4}}",
    },
    "consent_request": {
        "hi": "नमस्ते {{1}}, {{2}} ने {{3}} के लिए आपको सहमति पत्र भेजा है। कृपया इसे पढ़कर अपने फ़ोन पर हस्ताक्षर करें: {{4}} "
              "(लिंक 3 दिन तक मान्य)",
        "mr": "नमस्कार {{1}}, {{2}} यांनी {{3}} साठी तुम्हाला संमती पत्र पाठवले आहे. कृपया ते वाचून तुमच्या फोनवर सही करा: {{4}} "
              "(लिंक 3 दिवस वैध)",
    },
}

# Free-text replies sent back when a patient answers (allowed inside WhatsApp's 24-hour window).
REPLIES: dict[str, dict[str, str]] = {
    "confirmed": {
        "en": "Thank you, your appointment on {date} at {time} is confirmed.",
        "hi": "धन्यवाद, {date} को {time} बजे का आपका अपॉइंटमेंट पक्का हो गया है।",
        "mr": "धन्यवाद, {date} रोजी {time} वाजताची तुमची अपॉइंटमेंट निश्चित झाली आहे.",
    },
    "cancelled": {
        "en": "Your appointment on {date} at {time} is cancelled. Call {phone} or reply here to book again.",
        "hi": "{date} को {time} बजे का आपका अपॉइंटमेंट रद्द कर दिया गया है। फिर से बुक करने के लिए {phone} पर कॉल करें या यहाँ जवाब दें।",
        "mr": "{date} रोजी {time} वाजताची तुमची अपॉइंटमेंट रद्द केली आहे. पुन्हा बुक करण्यासाठी {phone} वर कॉल करा किंवा इथे उत्तर द्या.",
    },
    "reschedule": {
        "en": "No problem. The clinic will call you shortly to find a new time.",
        "hi": "कोई बात नहीं। नया समय तय करने के लिए क्लिनिक आपको जल्द ही कॉल करेगा।",
        "mr": "काही हरकत नाही. नवीन वेळ ठरवण्यासाठी क्लिनिक तुम्हाला लवकरच कॉल करेल.",
    },
    "offer_taken": {
        "en": "Sorry, the {date} {time} slot has just been taken. We'll keep you on the waitlist.",
        "hi": "माफ़ कीजिए, {date} {time} का समय अभी-अभी किसी और ने ले लिया। आप वेटिंग लिस्ट में बने रहेंगे।",
        "mr": "माफ करा, {date} {time} ची वेळ आत्ताच दुसऱ्या कोणी घेतली. तुम्ही प्रतीक्षा यादीत राहाल.",
    },
    "offer_accepted": {
        "en": "Done! You're booked for {date} at {time} with {dentist}.",
        "hi": "हो गया! {date} को {time} बजे {dentist} के साथ आपका अपॉइंटमेंट बुक हो गया है।",
        "mr": "झाले! {date} रोजी {time} वाजता {dentist} यांच्यासोबत तुमची अपॉइंटमेंट बुक झाली आहे.",
    },
    "recall_book": {
        "en": "Thank you! The clinic will call you shortly to book a time.",
        "hi": "धन्यवाद! समय बुक करने के लिए क्लिनिक आपको जल्द ही कॉल करेगा।",
        "mr": "धन्यवाद! वेळ बुक करण्यासाठी क्लिनिक तुम्हाला लवकरच कॉल करेल.",
    },
    "the_clinic": {"en": "the clinic", "hi": "क्लिनिक", "mr": "क्लिनिक"},
}

# Replies patients may type in their own language, in addition to the English keywords.
CONFIRM_WORDS_LOCAL = {"हाँ", "हां", "हो", "ठीक है", "ठीक", "पक्का", "कन्फर्म", "निश्चित", "ho"}
CANCEL_WORDS_LOCAL = {"रद्द", "रद्द करें", "रद्द करा", "कैंसल", "कॅन्सल"}
RESCHEDULE_WORDS_LOCAL = {"बदलें", "बदला", "समय बदलें", "वेळ बदला"}
YES_WORDS_LOCAL = {"हाँ", "हां", "हो", "ho", "चाहिए", "हवी"}

_WEEKDAYS = {
    "hi": ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "रवि"],
    "mr": ["सोम", "मंगळ", "बुध", "गुरु", "शुक्र", "शनि", "रवि"],
}
_MONTHS = {
    "hi": ["जन", "फ़र", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अग", "सित", "अक्टू", "नव", "दिस"],
    "mr": ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"],
}


def language_of(prefs: dict | None) -> str:
    """'Hindi' (as stored on the patient) -> 'hi'. Unknown or missing -> English."""
    value = str((prefs or {}).get("language") or "English").strip().lower()
    return LANGUAGE_CODES.get(value, value if value in SUPPORTED else "en")


def day_label(local: datetime, lang: str, with_weekday: bool = True) -> str:
    """'Tue 27 Oct' in English, 'मंगल 27 अक्टू' in Hindi."""
    if lang not in _MONTHS:
        return local.strftime("%a %d %b") if with_weekday else local.strftime("%d %b")
    day = f"{local.day} {_MONTHS[lang][local.month - 1]}"
    return f"{_WEEKDAYS[lang][local.weekday()]} {day}" if with_weekday else day


def reply(key: str, lang: str, **values: str) -> str:
    texts = REPLIES[key]
    return texts.get(lang, texts["en"]).format(**values)
