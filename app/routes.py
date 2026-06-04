from flask import Blueprint, request, jsonify, current_app, send_from_directory
from .database import get_db
from .models import row_to_dict

bp = Blueprint('main', __name__)


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

    db = get_db()
    cursor = db.execute(
        '''INSERT INTO bills
               (society_name, tenant_name, flat_number, floor, meter_number,
                billing_month, last_reading, present_reading, units_consumed,
                rate_per_unit, total_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            str(data['society_name']).strip(),
            str(data['tenant_name']).strip(),
            str(data['flat_number']).strip(),
            str(data['floor']).strip(),
            str(data['meter_number']).strip(),
            str(data['billing_month']).strip(),
            last_reading, present_reading, units_consumed, rate_per_unit, total_amount,
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
