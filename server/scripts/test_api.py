import requests

# Login
token_res = requests.post('http://127.0.0.1:8000/auth/login', data={'username': 'admin', 'password': 'admin'})
token = token_res.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}

vessels = ['AA7', '711', 'VS-AECY-07']
print('Vessel | Actual | Predicted')
print('-'*35)

for v in vessels:
    res = requests.get(f'http://127.0.0.1:8000/vessel/analysis?vesselId={v}', headers=headers).json()
    actual = res.get('actual', {}).get('avg_hours', 'N/A')
    predicted = res.get('predicted', {}).get('avg_hours', 'N/A')
    print(f"{v:10} | {actual} | {predicted}")
