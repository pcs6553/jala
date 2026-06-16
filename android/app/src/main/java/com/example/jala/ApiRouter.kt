package com.example.jala

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.lang.Exception

class ApiRouter(context: Context) {
    private val dbHelper = DatabaseHelper(context)

    fun handleRequest(urlString: String, method: String, bodyString: String): String {
        val uri = Uri.parse(urlString)
        val path = uri.path ?: ""
        
        val response = JSONObject()
        try {
            when {
                path == "/api/bills" -> {
                    if (method == "GET") {
                        val bills = dbHelper.getBills()
                        setResponse(response, 200, "OK", bills.toString())
                    } else if (method == "POST") {
                        val bodyJson = JSONObject(bodyString)
                        val inserted = dbHelper.insertBill(bodyJson)
                        setResponse(response, 201, "Created", inserted.toString())
                    } else {
                        setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                    }
                }
                path.startsWith("/api/bills/") -> {
                    val idStr = path.substring("/api/bills/".length)
                    val id = idStr.toIntOrNull()
                    if (id == null) {
                        setResponse(response, 400, "Bad Request", "{\"error\":\"Invalid bill ID\"}")
                    } else {
                        when (method) {
                            "GET" -> {
                                val bill = dbHelper.getBillById(id)
                                if (bill == null) {
                                    setResponse(response, 404, "Not Found", "{\"error\":\"Bill not found\"}")
                                } else {
                                    setResponse(response, 200, "OK", bill.toString())
                                }
                            }
                            "PUT" -> {
                                val bodyJson = JSONObject(bodyString)
                                val updated = dbHelper.updateBill(id, bodyJson)
                                if (updated == null) {
                                    setResponse(response, 404, "Not Found", "{\"error\":\"Bill not found\"}")
                                } else {
                                    setResponse(response, 200, "OK", updated.toString())
                                }
                            }
                            "DELETE" -> {
                                val deleted = dbHelper.deleteBill(id)
                                if (!deleted) {
                                    setResponse(response, 404, "Not Found", "{\"error\":\"Bill not found\"}")
                                } else {
                                    setResponse(response, 200, "OK", "{\"deleted\":$id}")
                                }
                            }
                            else -> {
                                setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                            }
                        }
                    }
                }
                path == "/api/last-reading" -> {
                    if (method == "GET") {
                        val meterNumber = uri.getQueryParameter("meter_number") ?: ""
                        val result = dbHelper.getLastReading(meterNumber)
                        setResponse(response, 200, "OK", result.toString())
                    } else {
                        setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                    }
                }
                path == "/api/admin/status" -> {
                    if (method == "GET") {
                        setResponse(response, 200, "OK", "{\"authenticated\":true}")
                    } else {
                        setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                    }
                }
                path == "/api/admin/login" -> {
                    if (method == "POST") {
                        setResponse(response, 200, "OK", "{\"ok\":true}")
                    } else {
                        setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                    }
                }
                path == "/api/admin/logout" -> {
                    if (method == "POST") {
                        setResponse(response, 200, "OK", "{\"ok\":true}")
                    } else {
                        setResponse(response, 405, "Method Not Allowed", "{\"error\":\"Method not allowed\"}")
                    }
                }
                else -> {
                    setResponse(response, 404, "Not Found", "{\"error\":\"Endpoint not found\"}")
                }
            }
        } catch (e: IllegalArgumentException) {
            e.printStackTrace()
            setResponse(response, 400, "Bad Request", "{\"error\":\"${e.message}\"}")
        } catch (e: Exception) {
            e.printStackTrace()
            setResponse(response, 500, "Internal Server Error", "{\"error\":\"${e.message}\"}")
        }
        
        return response.toString()
    }

    private fun setResponse(response: JSONObject, status: Int, statusText: String, body: String) {
        response.put("status", status)
        response.put("statusText", statusText)
        val headers = JSONObject()
        headers.put("Content-Type", "application/json")
        response.put("headers", headers)
        response.put("body", body)
    }
}
