BILL_FIELDS = (
    'id',
    'society_name',
    'tenant_name',
    'flat_number',
    'floor',
    'meter_number',
    'billing_month',
    'last_reading',
    'present_reading',
    'units_consumed',
    'rate_per_unit',
    'total_amount',
    'created_at',
)


def row_to_dict(row):
    return {field: row[field] for field in BILL_FIELDS}
