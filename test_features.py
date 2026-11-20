import os, tempfile, unittest, io
from unittest.mock import patch
from datetime import datetime, timedelta
from PIL import Image
_tmp = tempfile.TemporaryDirectory(dir=os.path.dirname(os.path.abspath(__file__)))
os.environ['DATABASE_URL'] = 'sqlite:///' + os.path.join(_tmp.name, 'test.db').replace('\\', '/')
os.environ['UPLOAD_FOLDER'] = os.path.join(_tmp.name, 'uploads')
os.environ['SECRET_KEY'] = 'test-only-secret'
os.environ['ADMIN_EMAIL'] = ''
import main as m

class Features(unittest.TestCase):
    def setUp(self):
        self.ctx = m.app.app_context(); self.ctx.push()
        m.db.drop_all(); m.db.create_all()
        self.client = m.app.test_client()
    def tearDown(self):
        m.db.session.remove(); self.ctx.pop()
    def login(self, name='A', role='user'):
        u=m.User(username=name,email=name+'@letovo.ru',role=role)
        m.db.session.add(u); m.db.session.commit()
        with self.client.session_transaction() as s: s['user_id']=u.id
        return u.id
    def event(self, status='approved'):
        e=m.Event(title='Test',summary='Summary',description='Description',activity='Sport',type='Club',duration='Hour',place='School',room='AS1',date='2026-11-20',time='17:00',end='18:00',organizer='A',status=status)
        m.db.session.add(e);m.db.session.commit();return e.id
    def test_registration_reuse_and_throttle(self):
        payload=dict(username='Student',email='student@letovo.ru')
        with patch.object(m,'send_email_code') as mail:
            self.assertEqual(self.client.post('/api/auth/register/request',json=payload).status_code,200)
            code=mail.call_args.args[1]
        self.assertEqual(self.client.post('/api/auth/register/request',json=payload).status_code,429)
        verify=dict(email=payload['email'],code=code)
        self.assertEqual(self.client.post('/api/auth/register/verify',json=verify).status_code,200)
        self.assertEqual(self.client.post('/api/auth/register/verify',json=verify).status_code,400)
    def test_expired_code_and_attempt_limit(self):
        m.db.session.add(m.AuthCode(email='a@letovo.ru',username='A',purpose='register',code_hash=m.generate_password_hash('123456'),expires_at=datetime.utcnow()-timedelta(seconds=1)));m.db.session.commit()
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/register/verify',json=dict(email='a@letovo.ru',code='123456')).status_code,400)
        self.assertEqual(self.client.post('/api/auth/register/verify',json=dict(email='a@letovo.ru',code='123456')).status_code,429)
    def test_login_code(self):
        self.login()
        with self.client.session_transaction() as s:s.clear()
        with patch.object(m,'send_email_code') as mail:
            u=m.User.query.first();u.email='a@letovo.ru';m.db.session.commit()
            self.assertEqual(self.client.post('/api/auth/login/request',json=dict(email='a@letovo.ru')).status_code,200)
            code=mail.call_args.args[1]
        self.assertEqual(self.client.post('/api/auth/login/verify',json=dict(email='a@letovo.ru',code=code)).status_code,200)
    def test_upload_decodes_and_serves(self):
        self.login()
        self.assertEqual(self.client.post('/api/upload-image',data={'image':(io.BytesIO(b'fake'),'fake.jpg')}).status_code,400)
        stream=io.BytesIO();Image.new('RGB',(20,20)).save(stream,'PNG');stream.seek(0)
        r=self.client.post('/api/upload-image',data={'image':(stream,'photo.png')});self.assertEqual(r.status_code,201)
        response=self.client.get(r.json['image_url']); self.assertEqual(response.status_code,200); response.close()
    def test_photo_persists_without_local_writes(self):
        uid=self.login()
        stream=io.BytesIO();Image.new('RGBA',(2500,20),(255,0,0,0)).save(stream,'PNG');stream.seek(0)
        with patch.object(m.os, 'makedirs', side_effect=OSError('Read-only filesystem')) as mkdir:
            r=self.client.post('/api/upload-image',data={'image':(stream,'фото.png')})
            self.assertEqual(r.status_code,201);mkdir.assert_not_called()
        photo=m.EventImage.query.one();self.assertEqual(photo.user_id,uid)
        m.db.session.remove()
        response=m.app.test_client().get(r.json['image_url'])
        self.assertEqual(response.status_code,200)
        with Image.open(io.BytesIO(response.data)) as result:
            self.assertEqual(result.format,'JPEG');self.assertEqual(result.width,2400)
            self.assertEqual(result.getpixel((0,0)),(255,255,255))
        response.close()
    def test_photo_file_and_pixel_limits(self):
        self.login()
        r=self.client.post('/api/upload-image',data={'image':(io.BytesIO(b'x'*(4*1024*1024+1)),'large.jpg')})
        self.assertEqual(r.status_code,413)
        with patch.object(m.Image, 'open') as opened:
            source=opened.return_value.__enter__.return_value
            source.format='JPEG';source.width=5001;source.height=4000
            r=self.client.post('/api/upload-image',data={'image':(io.BytesIO(b'fake'),'large.jpg')})
            self.assertEqual(r.status_code,400);source.load.assert_not_called()
        self.assertEqual(m.EventImage.query.count(),0)
    def test_photo_database_failure_is_not_invalid_image(self):
        self.login()
        stream=io.BytesIO();Image.new('RGB',(20,20)).save(stream,'JPEG');stream.seek(0)
        with patch.object(m.db.session, 'commit', side_effect=m.SQLAlchemyError('storage unavailable')):
            with self.assertLogs(m.app.logger,level='ERROR'):
                r=self.client.post('/api/upload-image',data={'image':(stream,'photo.jpg')})
        self.assertEqual(r.status_code,503)
        self.assertEqual(m.EventImage.query.count(),0)

    def test_comments_permissions_and_visibility(self):
        eid=self.event(); hidden=self.event('pending')
        self.assertEqual(self.client.post(f'/api/events/{eid}/comments',json={'body':'hello'}).status_code,401)
        self.login();r=self.client.post(f'/api/events/{eid}/comments',json={'body':'<b>hello</b>'});self.assertEqual(r.status_code,200);cid=r.json[0]['id']
        self.assertEqual(self.client.get(f'/api/events/{hidden}/comments').status_code,404)
        self.login('B');self.assertEqual(self.client.delete(f'/api/comments/{cid}').status_code,403)
        self.login('Admin','admin');self.assertEqual(self.client.delete(f'/api/comments/{cid}').status_code,200)
    def test_event_creation_customization_and_moderation(self):
        payload=dict(title='Photo event',summary='Summary',description='Details',activity='Sport',type='Club',duration='Hour',place='School',room='AS1',date='2026-11-20',time='17:00',end='18:00',organizer='Student',card_color='cream',card_emoji='*',tagline='Welcome')
        self.assertEqual(self.client.post('/api/events',json=payload).status_code,401)
        self.login()
        r=self.client.post('/api/events',json=payload);self.assertEqual(r.status_code,201)
        self.assertEqual(r.json['card_emoji'],'*');self.assertEqual(r.json['status'],'pending')
        self.assertEqual(self.client.get('/api/events').json,[])
        payload['image_url']='https://example.com/photo.jpg'
        self.assertEqual(self.client.post('/api/events',json=payload).status_code,400)

    def test_rejected_event_can_be_edited_and_resubmitted_by_creator(self):
        uid = self.login()
        eid = self.event("rejected")
        event = m.db.session.get(m.Event, eid)
        event.creator_id = uid
        event.moderation_comment = "Уточните место проведения"
        event.count = 3
        m.db.session.commit()

        payload = dict(
            title="Updated event", summary="Updated summary",
            description="Updated details", activity="Sport", type="Club",
            duration="Hour", place="School", room="AS2",
            date="2026-11-21", time="18:00", end="19:00",
            organizer="Student", regular=False, chat="", contact="",
            image_url=None, card_color="blue", card_emoji="🏀",
            tagline="Updated"
        )
        response = self.client.put(f"/api/events/{eid}", json=payload)
        self.assertEqual(response.status_code, 200)
        updated = response.json["event"]
        self.assertEqual(updated["id"], eid)
        self.assertEqual(updated["creator_id"], uid)
        self.assertEqual(updated["title"], "Updated event")
        self.assertEqual(updated["status"], "pending")
        self.assertIsNone(updated["moderation_comment"])
        self.assertEqual(updated["count"], 3)

    def test_only_creator_can_edit_rejected_event(self):
        creator_id = self.login("Creator")
        eid = self.event("rejected")
        event = m.db.session.get(m.Event, eid)
        event.creator_id = creator_id
        m.db.session.commit()

        self.login("Other")
        response = self.client.put(f"/api/events/{eid}", json={
            "title": "Hack"
        })
        self.assertEqual(response.status_code, 403)
        self.assertEqual(m.db.session.get(m.Event, eid).title, "Test")

    def test_non_rejected_event_cannot_be_edited(self):
        creator_id = self.login("Creator")
        eid = self.event("pending")
        event = m.db.session.get(m.Event, eid)
        event.creator_id = creator_id
        m.db.session.commit()
        response = self.client.put(f"/api/events/{eid}", json={
            "title": "Hack"
        })
        self.assertEqual(response.status_code, 409)

    def test_map_and_origin(self):
        import json
        from pathlib import Path
        rooms=json.loads(Path('static/maps/rooms.json').read_text(encoding='utf-8'))
        self.assertEqual(len(rooms),149)
        for r in rooms:
            with Image.open(f'static/maps/floor_{r["floor"]}.png') as im:
                self.assertTrue(0 <= r['x'] <= r['reference_width'] and 0 <= r['y'] <= r['reference_height'])
        self.assertEqual(self.client.get('/map').status_code,200)
        self.assertEqual(self.client.post('/api/auth/logout',headers={'Origin':'https://evil.example'}).status_code,403)
    def test_email_fails_closed(self):
        with patch.dict(os.environ, {'SMTP_HOST':'','MAIL_MODE':''}):
            with self.assertRaises(RuntimeError):m.send_email_code('a@letovo.ru','123456','login')
    def payload(self):
        return dict(title='Corrected', summary='Summary', description='Details',
                    activity='Sport', type='Club', duration='Hour', place='School',
                    room='C328', date='2026-11-21', time='17:00', end='18:00',
                    organizer='Student', regular=False, card_color='blue')

    def test_qr_permissions_and_published_status(self):
        event_id = self.event()
        path = f'/api/events/{event_id}/qr'
        with patch.dict(os.environ, {'PUBLIC_BASE_URL': 'https://school.example/'}):
            with patch.object(m.qrcode.QRCode, 'add_data', autospec=True) as add:
                response = self.client.get(path + '?download=1')
                self.assertEqual(add.call_args.args[1], f'https://school.example/#event/{event_id}')
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment;', response.headers['Content-Disposition'])
        with Image.open(io.BytesIO(response.data)) as image:
            self.assertEqual(image.format, 'PNG')
        response.close()
        for status in ['pending', 'rejected']:
            event = m.db.session.get(m.Event, event_id)
            event.status = status
            m.db.session.commit()
            self.assertEqual(self.client.get(path).status_code, 404)
        self.login('Admin', 'admin')
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_reject_resubmit_approve_keeps_registration(self):
        creator = self.login()
        event_id = self.event('approved')
        event = m.db.session.get(m.Event, event_id)
        event.creator_id = creator
        event.count = 1
        m.db.session.add(m.Registration(user_id=creator, event_id=event_id))
        m.db.session.commit()
        self.login('Admin', 'admin')
        self.assertEqual(self.client.post(f'/api/admin/events/{event_id}/reject', json={'comment': 'Уточните кабинет'}).status_code, 200)
        with self.client.session_transaction() as session:
            session['user_id'] = creator
        self.assertEqual(self.client.put(f'/api/events/{event_id}', json=self.payload()).status_code, 200)
        self.assertEqual(self.client.get('/api/events').json, [])
        self.assertEqual(m.Registration.query.filter_by(event_id=event_id).count(), 1)
        admin = m.User.query.filter_by(role='admin').one()
        with self.client.session_transaction() as session:
            session['user_id'] = admin.id
        self.assertEqual(self.client.post(f'/api/admin/events/{event_id}/approve').status_code, 200)
        published = self.client.get('/api/events').json
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]['count'], 1)
        self.assertEqual(published[0]['title'], 'Corrected')

    def test_resubmission_preserves_omitted_existing_photo(self):
        creator = self.login()
        event_id = self.event('rejected')
        event = m.db.session.get(m.Event, event_id)
        event.creator_id = creator
        event.image_url = '/static/uploads/old-photo.jpg'
        m.db.session.commit()
        response = self.client.put(f'/api/events/{event_id}', json=self.payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['event']['image_url'], '/static/uploads/old-photo.jpg')

    def test_cannot_use_another_users_photo(self):
        first = self.login('First')
        photo_id = 'a' * 32
        m.db.session.add(m.EventImage(id=photo_id, user_id=first, data=b'image'))
        m.db.session.commit()
        self.login('Second')
        payload = self.payload()
        payload['image_url'] = f'/media/{photo_id}.jpg'
        self.assertEqual(self.client.post('/api/events', json=payload).status_code, 403)

    def test_api_errors_and_invalid_forms(self):
        response = self.client.get('/api/events/99999')
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.json)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.login()
        self.assertEqual(self.client.post('/api/events', json=[]).status_code, 400)
        for changes in ({'time': '19:00'}, {'title': 'x' * 151}, {'regular': 'false'}, {'contact': 'javascript:alert(1)'}):
            with self.subTest(changes=changes):
                payload = {**self.payload(), **changes}
                self.assertEqual(self.client.post('/api/events', json=payload).status_code, 400)


def tearDownModule():
    with m.app.app_context():
        m.db.session.remove(); m.db.engine.dispose()
    _tmp.cleanup()

if __name__ == '__main__': unittest.main()
