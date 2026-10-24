import pytest

from app.core.config import get_settings
from app.services import ai

API = "/api/v1"


@pytest.fixture()
def mock_ai(monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_provider", "mock")
    yield


def plan_id(client, h, patient="pat_1"):
    return client.get(f"{API}/patients/{patient}/treatment-plans", headers=h).json()[0]["id"]


def test_disabled_by_default(client, as_role):
    h = as_role("dentist")
    assert client.get(f"{API}/ai/status", headers=h).json()["enabled"] is False
    res = client.post(f"{API}/ai/soap-draft", headers=h, json={"patientId": "pat_1", "transcript": "Pain in 36 for two days"})
    assert res.status_code == 503 and res.json()["code"] == "AI_DISABLED"


def test_soap_draft_with_mock(client, as_role, mock_ai):
    h = as_role("dentist")
    notes_before = len(client.get(f"{API}/patients/pat_1/clinical-notes", headers=h).json())
    res = client.post(f"{API}/ai/soap-draft", headers=h, json={
        "patientId": "pat_1", "transcript": "Alice has pain on 36 since two days, TTP positive, IOPA shows periapical lesion."})
    assert res.status_code == 200, res.text
    d = res.json()
    assert d["demo"] and d["teeth"] == ["36"] and d["subjective"] and d["needsChecking"]
    assert len(client.get(f"{API}/patients/pat_1/clinical-notes", headers=h).json()) == notes_before, "drafts aren't saved"
    assert client.post(f"{API}/ai/soap-draft", headers=as_role("receptionist"),
                       json={"patientId": "pat_1", "transcript": "Pain in 36 for two days"}).status_code == 403


def test_names_and_numbers_are_removed_before_sending():
    text = ai._strip_names("Alice Green says Alice's tooth hurts. Call +91 98765 11111.", ["Alice", "Green", "Alice Green"])
    assert "Alice" not in text and "Green" not in text and "98765" not in text and "the patient" in text


def test_requests_send_no_identifiers(monkeypatch, client, as_role):
    sent = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"content": [{"type": "tool_use", "name": "draft_soap_note", "input": {
                "subjective": "Pain", "objective": "TTP 36", "assessment": "Apical periodontitis 36", "plan": "RCT",
                "teeth": ["36", "99"], "follow_up": "1 week", "needs_checking": []}}]}

    def fake_post(url, headers, json, timeout):
        sent["url"], sent["headers"], sent["body"] = url, headers, json
        return FakeResponse()

    monkeypatch.setattr(get_settings(), "ai_provider", "anthropic")
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai.httpx, "post", fake_post)
    res = client.post(f"{API}/ai/soap-draft", headers=as_role("dentist"), json={
        "patientId": "pat_1", "transcript": "Alice Green, phone 9876511111, pain in 36."})
    assert res.status_code == 200, res.text
    assert res.json()["teeth"] == ["36"], "invalid tooth numbers are dropped"
    prompt = sent["body"]["messages"][0]["content"]
    assert "Alice" not in prompt and "9876511111" not in prompt and "Penicillin" in prompt
    assert sent["body"]["tool_choice"]["name"] == "draft_soap_note" and sent["headers"]["x-api-key"] == "test-key"


def test_explanation_draft_save_and_share(client, as_role, mock_ai):
    h = as_role("dentist")
    pid = plan_id(client, h)
    draft = client.post(f"{API}/treatment-plans/{pid}/explanation/draft", headers=h, json={"language": "hi"}).json()
    assert draft["language"] == "hi" and draft["steps"] and draft["demo"]

    body = {**draft, "steps": [{"name": s["name"], "why": s["why"], "whatToExpect": s["whatToExpect"]} for s in draft["steps"]], "shared": False}
    saved = client.put(f"{API}/treatment-plans/{pid}/explanation", headers=h, json=body).json()
    assert saved["shared"] is False and saved["reviewedBy"].startswith("Dr.")
    p = as_role("patient")
    mine = next(x for x in client.get(f"{API}/patient-portal/treatment-plans", headers=p).json() if x["id"] == pid)
    assert mine["patientExplanation"] is None, "not shared yet"

    client.put(f"{API}/treatment-plans/{pid}/explanation", headers=h, json={**body, "shared": True})
    mine = next(x for x in client.get(f"{API}/patient-portal/treatment-plans", headers=p).json() if x["id"] == pid)
    assert mine["patientExplanation"]["summary"] and mine["patientExplanation"]["sharedAt"]


def test_rate_limit(client, as_role, mock_ai, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_requests_per_hour", 1)
    h = as_role("dentist")
    body = {"patientId": "pat_1", "transcript": "Routine check, no complaints, scaling done."}
    assert client.post(f"{API}/ai/soap-draft", headers=h, json=body).status_code == 200
    second = client.post(f"{API}/ai/soap-draft", headers=h, json=body)
    assert second.status_code == 429 and second.json()["code"] == "AI_RATE_LIMITED"
