"""Prescriptions: numbering and allergy checks."""

import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Medicine, Patient, Prescription

# Allergy words a patient record may contain -> drug classes / medicine words they rule out.
ALLERGY_RULES: dict[str, set[str]] = {
    "penicillin": {"penicillin", "amoxicillin", "ampicillin", "clavulan", "augmentin", "cloxacillin"},
    "amoxicillin": {"penicillin", "amoxicillin", "ampicillin", "clavulan", "augmentin"},
    "cephalosporin": {"cephalosporin", "cefixime", "cefuroxime", "cephalexin", "cefadroxil"},
    "sulfa": {"sulfa", "sulfonamide", "sulfamethoxazole", "cotrimoxazole"},
    "nsaid": {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "naproxen", "aspirin", "mefenamic"},
    "aspirin": {"nsaid", "aspirin", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "naproxen"},
    "ibuprofen": {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "naproxen", "aspirin"},
    "macrolide": {"macrolide", "azithromycin", "erythromycin", "clarithromycin"},
    "metronidazole": {"metronidazole", "nitroimidazole", "tinidazole", "ornidazole"},
    "clindamycin": {"clindamycin", "lincosamide"},
    "lidocaine": {"lidocaine", "lignocaine", "local anaesthetic", "local anesthetic"},
    "chlorhexidine": {"chlorhexidine"},
    "paracetamol": {"paracetamol", "acetaminophen"},
}

# Conditions that call for care with common dental medicines.
CONDITION_RULES: list[tuple[set[str], set[str], str]] = [
    ({"pregnan"}, {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "metronidazole", "tetracycline", "doxycycline"},
     "Patient may be pregnant: check safety in pregnancy"),
    ({"kidney", "renal", "ckd"}, {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac"},
     "Kidney disease on record: NSAIDs can worsen kidney function"),
    ({"ulcer", "gastritis", "gerd", "acidity"}, {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac"},
     "Stomach ulcer or gastritis on record: consider a stomach protector or a non-NSAID painkiller"),
    ({"asthma"}, {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "aspirin"},
     "Asthma on record: NSAIDs can trigger asthma in some patients"),
    ({"warfarin", "anticoagul", "blood thinner", "acitrom"}, {"nsaid", "ibuprofen", "diclofenac", "aceclofenac", "ketorolac", "aspirin", "metronidazole"},
     "Patient takes blood thinners: higher bleeding risk with this medicine"),
    ({"liver", "hepat", "cirrhosis"}, {"paracetamol", "acetaminophen", "metronidazole"},
     "Liver disease on record: check the dose"),
]


def _words(item: dict) -> str:
    return " ".join(str(item.get(k) or "") for k in ("name", "genericName", "drugClass")).lower()


def check_items(db: Session, patient: Patient, items: list[dict]) -> list[dict]:
    """Return warnings for allergies, duplicate medicines and medical conditions on record."""
    history = patient.medical_history or {}
    allergies = [str(a).strip().lower() for a in (history.get("allergies") or []) if str(a).strip()]
    conditions = " ".join(str(c).lower() for c in (
        (history.get("chronicConditions") or []) + (history.get("medications") or []) +
        [history.get("pastSurgeries") or ""]
    ))
    classes = {m.id: m.drug_class for m in db.scalars(select(Medicine).where(
        Medicine.id.in_([i.get("medicineId") for i in items if i.get("medicineId")])))}
    warnings: list[dict] = []
    seen: dict[str, str] = {}
    for item in items:
        text = _words({**item, "drugClass": classes.get(item.get("medicineId"), "")})
        name = item.get("name") or "Medicine"
        for allergy in allergies:
            ruled_out = set().union(*(words for key, words in ALLERGY_RULES.items() if key in allergy)) or {allergy}
            hit = next((w for w in ruled_out if w and w in text), None)
            if hit:
                warnings.append({"type": "allergy", "medicine": name,
                                 "message": f"{name}: patient is allergic to {allergy.title()}"})
                break
        for triggers, risky, message in CONDITION_RULES:
            if any(t in conditions for t in triggers) and any(r in text for r in risky):
                warnings.append({"type": "condition", "medicine": name, "message": f"{name}: {message}"})
        generic = re.sub(r"\W+", " ", (item.get("genericName") or name).lower()).strip()
        if generic in seen:
            warnings.append({"type": "duplicate", "medicine": name, "message": f"{name} is listed twice ({seen[generic]})"})
        seen[generic] = name
    return warnings


def next_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"RX-{year}-"
    last = db.scalar(select(func.max(Prescription.number)).where(Prescription.number.like(f"{prefix}%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{n:04d}"


DENTAL_MEDICINES = [
    # name, generic, form, strength, dosage, frequency, days, timing, instructions, class
    ("Amoxicillin", "Amoxicillin", "Capsule", "500 mg", "1 capsule", "1-1-1", 5, "After food", "Complete the full course", "penicillin"),
    ("Augmentin", "Amoxicillin + Clavulanic acid", "Tablet", "625 mg", "1 tablet", "1-0-1", 5, "After food", "Complete the full course", "penicillin"),
    ("Metronidazole", "Metronidazole", "Tablet", "400 mg", "1 tablet", "1-1-1", 5, "After food", "Avoid alcohol during and 2 days after", "metronidazole"),
    ("Azithromycin", "Azithromycin", "Tablet", "500 mg", "1 tablet", "1-0-0", 3, "Before food", "", "macrolide"),
    ("Clindamycin", "Clindamycin", "Capsule", "300 mg", "1 capsule", "1-1-1", 5, "After food", "Stop and call if diarrhoea", "clindamycin"),
    ("Ibuprofen", "Ibuprofen", "Tablet", "400 mg", "1 tablet", "1-0-1", 3, "After food", "Only when in pain", "nsaid"),
    ("Zerodol-P", "Aceclofenac + Paracetamol", "Tablet", "100/325 mg", "1 tablet", "1-0-1", 3, "After food", "Only when in pain", "nsaid"),
    ("Ketorol DT", "Ketorolac", "Tablet", "10 mg", "1 tablet", "1-0-1", 2, "After food", "Dissolve in water; not more than 5 days", "nsaid"),
    ("Paracetamol", "Paracetamol", "Tablet", "650 mg", "1 tablet", "1-1-1", 3, "After food", "Only when in pain or fever", ""),
    ("Pantoprazole", "Pantoprazole", "Tablet", "40 mg", "1 tablet", "1-0-0", 5, "Before food", "30 minutes before breakfast", ""),
    ("Chlorhexidine mouthwash", "Chlorhexidine gluconate", "Mouthwash", "0.2%", "10 ml", "1-0-1", 7, "After food",
     "Rinse for 30 seconds, don't swallow; no food or drink for 30 minutes", "chlorhexidine"),
    ("Betadine gargle", "Povidone iodine", "Gargle", "2%", "10 ml in water", "1-1-1", 5, "After food", "Gargle and spit", ""),
    ("Benzocaine gel", "Benzocaine", "Gel", "20%", "Apply thin layer", "1-1-1", 3, "Any time", "Apply on the sore area", ""),
    ("Sensodyne toothpaste", "Potassium nitrate", "Toothpaste", "5%", "Pea-sized", "1-0-1", 30, "Any time", "Brush gently; don't rinse straight away", ""),
    ("Cetirizine", "Cetirizine", "Tablet", "10 mg", "1 tablet", "0-0-1", 3, "After food", "May cause drowsiness", ""),
]


def seed_medicines(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Medicine)):
        return
    for name, generic, form, strength, dosage, freq, days, timing, instr, cls in DENTAL_MEDICINES:
        db.add(Medicine(name=name, generic_name=generic, form=form, strength=strength, default_dosage=dosage,
                        default_frequency=freq, default_duration_days=days, default_timing=timing,
                        default_instructions=instr, drug_class=cls))
