from functools import wraps
from flask import Blueprint, request, jsonify, current_app, send_from_directory, session
from .database import get_db
from .models import row_to_dict

bp = Blueprint('main', __name__)


def admin_required(f):
    """Guard mutating admin endpoints behind a logged-in session."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('is_admin'):
            return jsonify({'error': 'Admin authentication required'}), 401
        return f(*args, **kwargs)
    return wrapper


@bp.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(force=True, silent=True) or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))

    if (username == current_app.config['ADMIN_USER']
            and password == current_app.config['ADMIN_PASSWORD']):
        session['is_admin'] = True
        return jsonify({'ok': True})
    return jsonify({'error': 'Invalid username or password'}), 401


@bp.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('is_admin', None)
    return jsonify({'ok': True})


@bp.route('/api/admin/status', methods=['GET'])
def admin_status():
    return jsonify({'authenticated': bool(session.get('is_admin'))})


@bp.route('/')
def index():
    return send_from_directory(current_app.static_folder, 'index.html')


@bp.route('/api/bills', methods=['POST'])
def create_bill():
    data = request.get_json(force=True, silent=True) or {}

    required = [
        'society_name', 'tenant_name', 'flat_number', 'floor',
        'meter_number', 'billing_month', 'last_reading', 'present_reading', 'rate_per_unit',
    ]
    for field in required:
        if data.get(field) is None or str(data[field]).strip() == '':
            return jsonify({'error': f'Missing required field: {field}'}), 400

    try:
        last_reading = float(data['last_reading'])
        present_reading = float(data['present_reading'])
        rate_per_unit = float(data['rate_per_unit'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Readings and rate must be numeric'}), 400

    if present_reading < last_reading:
        return jsonify({'error': 'Present reading must be >= last reading'}), 400

    if rate_per_unit <= 0:
        return jsonify({'error': 'Rate per unit must be greater than 0'}), 400

    units_consumed = round(present_reading - last_reading, 4)
    total_amount = round(units_consumed * rate_per_unit, 2)

    mobile  = str(data.get('mobile', '') or '').strip()
    remarks = str(data.get('remarks', '') or '').strip()

    db = get_db()
    cursor = db.execute(
        '''INSERT INTO bills
               (society_name, tenant_name, flat_number, floor, mobile, meter_number,
                billing_month, last_reading, present_reading, units_consumed,
                rate_per_unit, total_amount, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            str(data['society_name']).strip(),
            str(data['tenant_name']).strip(),
            str(data['flat_number']).strip(),
            str(data['floor']).strip(),
            mobile,
            str(data['meter_number']).strip(),
            str(data['billing_month']).strip(),
            last_reading, present_reading, units_consumed, rate_per_unit, total_amount,
            remarks,
        )
    )
    db.commit()

    row = db.execute('SELECT * FROM bills WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@bp.route('/api/bills', methods=['GET'])
def get_bills():
    db = get_db()
    rows = db.execute('SELECT * FROM bills ORDER BY id DESC').fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@bp.route('/api/bills/<int:bill_id>', methods=['GET'])
def get_bill(bill_id):
    db = get_db()
    row = db.execute('SELECT * FROM bills WHERE id = ?', (bill_id,)).fetchone()
    if row is None:
        return jsonify({'error': 'Bill not found'}), 404
    return jsonify(row_to_dict(row))


@bp.route('/api/bills/<int:bill_id>', methods=['PUT'])
@admin_required
def update_bill(bill_id):
    data = request.get_json(force=True, silent=True) or {}

    db = get_db()
    existing = db.execute('SELECT * FROM bills WHERE id = ?', (bill_id,)).fetchone()
    if existing is None:
        return jsonify({'error': 'Bill not found'}), 404

    required = [
        'society_name', 'tenant_name', 'flat_number', 'floor',
        'meter_number', 'billing_month', 'last_reading', 'present_reading', 'rate_per_unit',
    ]
    for field in required:
        if data.get(field) is None or str(data[field]).strip() == '':
            return jsonify({'error': f'Missing required field: {field}'}), 400

    try:
        last_reading_v    = float(data['last_reading'])
        present_reading_v = float(data['present_reading'])
        rate_per_unit_v   = float(data['rate_per_unit'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Readings and rate must be numeric'}), 400

    if present_reading_v < last_reading_v:
        return jsonify({'error': 'Present reading must be >= last reading'}), 400
    if rate_per_unit_v <= 0:
        return jsonify({'error': 'Rate per unit must be greater than 0'}), 400

    units_consumed = round(present_reading_v - last_reading_v, 4)
    total_amount   = round(units_consumed * rate_per_unit_v, 2)
    mobile  = str(data.get('mobile', '') or '').strip()
    remarks = str(data.get('remarks', '') or '').strip()

    db.execute(
        '''UPDATE bills SET
               society_name = ?, tenant_name = ?, flat_number = ?, floor = ?, mobile = ?,
               meter_number = ?, billing_month = ?, last_reading = ?, present_reading = ?,
               units_consumed = ?, rate_per_unit = ?, total_amount = ?, remarks = ?
           WHERE id = ?''',
        (
            str(data['society_name']).strip(),
            str(data['tenant_name']).strip(),
            str(data['flat_number']).strip(),
            str(data['floor']).strip(),
            mobile,
            str(data['meter_number']).strip(),
            str(data['billing_month']).strip(),
            last_reading_v, present_reading_v, units_consumed, rate_per_unit_v, total_amount,
            remarks,
            bill_id,
        )
    )
    db.commit()

    row = db.execute('SELECT * FROM bills WHERE id = ?', (bill_id,)).fetchone()
    return jsonify(row_to_dict(row))


@bp.route('/api/bills/<int:bill_id>', methods=['DELETE'])
@admin_required
def delete_bill(bill_id):
    db = get_db()
    row = db.execute('SELECT id FROM bills WHERE id = ?', (bill_id,)).fetchone()
    if row is None:
        return jsonify({'error': 'Bill not found'}), 404
    db.execute('DELETE FROM bills WHERE id = ?', (bill_id,))
    db.commit()
    return jsonify({'deleted': bill_id})


@bp.route('/api/last-reading', methods=['GET'])
def last_reading():
    meter_number = request.args.get('meter_number', '').strip()
    if not meter_number:
        return jsonify({'found': False})

    db = get_db()
    row = db.execute(
        'SELECT * FROM bills WHERE meter_number = ? ORDER BY id DESC LIMIT 1',
        (meter_number,)
    ).fetchone()

    if row is None:
        return jsonify({'found': False})

    result = row_to_dict(row)
    result['found'] = True
    return jsonify(result)
