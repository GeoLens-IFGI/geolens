def test_health_ok(client) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "geolens-c2pa-backend"
    assert body["trust_profile"] in {"dev", "c2pa-prod", "c2pa-prod+itl"}
    assert body["sdk_version"]
