package com.example.jala

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class DatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "waterbills.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_BILLS = "bills"

        private val BILL_FIELDS = arrayOf(
            "id", "society_name", "tenant_name", "flat_number", "floor",
            "mobile", "meter_number", "billing_month", "last_reading",
            "present_reading", "units_consumed", "rate_per_unit", "total_amount",
            "remarks", "created_at"
        )
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS $TABLE_BILLS (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                society_name    TEXT    NOT NULL,
                tenant_name     TEXT    NOT NULL,
                flat_number     TEXT    NOT NULL,
                floor           TEXT    NOT NULL,
                mobile          TEXT    DEFAULT '',
                meter_number    TEXT    NOT NULL,
                billing_month   TEXT    NOT NULL,
                last_reading    REAL    NOT NULL,
                present_reading REAL    NOT NULL,
                units_consumed  REAL    NOT NULL,
                rate_per_unit   REAL    NOT NULL,
                total_amount    REAL    NOT NULL,
                remarks         TEXT    DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Fresh install for the APK, so no upgrade logic needed for now.
    }

    private fun getUTCTimeString(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun round(value: Double, places: Int): Double {
        if (places < 0) throw IllegalArgumentException()
        var bd = BigDecimal(value.toString())
        bd = bd.setScale(places, RoundingMode.HALF_UP)
        return bd.toDouble()
    }

    fun insertBill(json: JSONObject): JSONObject {
        val db = this.writableDatabase

        val lastReading = json.getDouble("last_reading")
        val presentReading = json.getDouble("present_reading")
        val ratePerUnit = json.getDouble("rate_per_unit")

        if (presentReading < lastReading) {
            throw IllegalArgumentException("Present reading must be >= last reading")
        }
        if (ratePerUnit <= 0) {
            throw IllegalArgumentException("Rate per unit must be greater than 0")
        }

        val unitsConsumed = round(presentReading - lastReading, 4)
        val totalAmount = round(unitsConsumed * ratePerUnit, 2)

        val values = ContentValues().apply {
            put("society_name", json.getString("society_name").trim())
            put("tenant_name", json.getString("tenant_name").trim())
            put("flat_number", json.getString("flat_number").trim())
            put("floor", json.getString("floor").trim())
            put("mobile", json.optString("mobile", "").trim())
            put("meter_number", json.getString("meter_number").trim())
            put("billing_month", json.getString("billing_month").trim())
            put("last_reading", lastReading)
            put("present_reading", presentReading)
            put("units_consumed", unitsConsumed)
            put("rate_per_unit", ratePerUnit)
            put("total_amount", totalAmount)
            put("remarks", json.optString("remarks", "").trim())
            put("created_at", getUTCTimeString())
        }

        val id = db.insertOrThrow(TABLE_BILLS, null, values)
        return getBillById(id.toInt()) ?: throw Exception("Failed to retrieve inserted bill")
    }

    fun getBills(): JSONArray {
        val db = this.readableDatabase
        val array = JSONArray()
        val cursor = db.rawQuery("SELECT * FROM $TABLE_BILLS ORDER BY id DESC", null)

        cursor.use {
            if (it.moveToFirst()) {
                do {
                    val obj = JSONObject()
                    for (field in BILL_FIELDS) {
                        val idx = it.getColumnIndex(field)
                        if (idx != -1) {
                            when (field) {
                                "id" -> obj.put(field, it.getInt(idx))
                                "last_reading", "present_reading", "units_consumed", "rate_per_unit", "total_amount" -> {
                                    obj.put(field, it.getDouble(idx))
                                }
                                else -> obj.put(field, it.getString(idx) ?: "")
                            }
                        }
                    }
                    array.put(obj)
                } while (it.moveToNext())
            }
        }
        return array
    }

    fun getBillById(id: Int): JSONObject? {
        val db = this.readableDatabase
        val cursor = db.rawQuery("SELECT * FROM $TABLE_BILLS WHERE id = ?", arrayOf(id.toString()))

        cursor.use {
            if (it.moveToFirst()) {
                val obj = JSONObject()
                for (field in BILL_FIELDS) {
                    val idx = it.getColumnIndex(field)
                    if (idx != -1) {
                        when (field) {
                            "id" -> obj.put(field, it.getInt(idx))
                            "last_reading", "present_reading", "units_consumed", "rate_per_unit", "total_amount" -> {
                                obj.put(field, it.getDouble(idx))
                            }
                            else -> obj.put(field, it.getString(idx) ?: "")
                        }
                    }
                }
                return obj
            }
        }
        return null
    }

    fun updateBill(id: Int, json: JSONObject): JSONObject? {
        val db = this.writableDatabase

        val lastReading = json.getDouble("last_reading")
        val presentReading = json.getDouble("present_reading")
        val ratePerUnit = json.getDouble("rate_per_unit")

        if (presentReading < lastReading) {
            throw IllegalArgumentException("Present reading must be >= last reading")
        }
        if (ratePerUnit <= 0) {
            throw IllegalArgumentException("Rate per unit must be greater than 0")
        }

        val unitsConsumed = round(presentReading - lastReading, 4)
        val totalAmount = round(unitsConsumed * ratePerUnit, 2)

        val values = ContentValues().apply {
            put("society_name", json.getString("society_name").trim())
            put("tenant_name", json.getString("tenant_name").trim())
            put("flat_number", json.getString("flat_number").trim())
            put("floor", json.getString("floor").trim())
            put("mobile", json.optString("mobile", "").trim())
            put("meter_number", json.getString("meter_number").trim())
            put("billing_month", json.getString("billing_month").trim())
            put("last_reading", lastReading)
            put("present_reading", presentReading)
            put("units_consumed", unitsConsumed)
            put("rate_per_unit", ratePerUnit)
            put("total_amount", totalAmount)
            put("remarks", json.optString("remarks", "").trim())
        }

        val count = db.update(TABLE_BILLS, values, "id = ?", arrayOf(id.toString()))
        return if (count > 0) getBillById(id) else null
    }

    fun deleteBill(id: Int): Boolean {
        val db = this.writableDatabase
        val count = db.delete(TABLE_BILLS, "id = ?", arrayOf(id.toString()))
        return count > 0
    }

    fun getLastReading(meterNumber: String): JSONObject {
        val db = this.readableDatabase
        val cursor = db.rawQuery(
            "SELECT * FROM $TABLE_BILLS WHERE meter_number = ? ORDER BY id DESC LIMIT 1",
            arrayOf(meterNumber.trim())
        )

        val result = JSONObject()
        cursor.use {
            if (it.moveToFirst()) {
                result.put("found", true)
                for (field in BILL_FIELDS) {
                    val idx = it.getColumnIndex(field)
                    if (idx != -1) {
                        when (field) {
                            "id" -> result.put(field, it.getInt(idx))
                            "last_reading", "present_reading", "units_consumed", "rate_per_unit", "total_amount" -> {
                                result.put(field, it.getDouble(idx))
                            }
                            else -> result.put(field, it.getString(idx) ?: "")
                        }
                    }
                }
            } else {
                result.put("found", false)
            }
        }
        return result
    }
}
