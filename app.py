
from flask import Flask, jsonify, request, send_from_directory
from pathlib import Path
from datetime import datetime, timezone
from db import initialize_database, get_connection

app = Flask(__name__)
FRONTEND_DIR = Path(__file__).parent / "RESCUE-SENSE-OPS"
# Create the database tables if they do not exist.
initialize_database()





@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


@app.route("/api/sensors", methods=["POST"])
def save_sensor_reading():
    data = request.get_json(silent=True) or {}

    sensor_id = data.get("sensor_id")
    reading = data.get("reading")
    risk_level = data.get("risk_level")

    if not sensor_id or reading is None or not risk_level:
        return jsonify({
            "error": "sensor_id, reading and risk_level are required"
        }), 400

    try:
        reading = float(reading)
    except (ValueError, TypeError):
        return jsonify({"error": "reading must be a number"}), 400

    if risk_level not in ("Normal", "Warning", "Critical"):
        return jsonify({"error": "Invalid risk_level"}), 400

    recorded_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute(
            """INSERT INTO sensor_readings
               (sensor_id, reading, risk_level, recorded_at)
               VALUES (?, ?, ?, ?)""",
            (str(sensor_id), reading, risk_level, recorded_at)
        )
        reading_id = cursor.lastrowid

    return jsonify({
        "message": "Sensor reading saved",
        "id": reading_id,
        "sensor_id": sensor_id,
        "reading": reading,
        "risk_level": risk_level,
        "recorded_at": recorded_at
    }), 201


@app.route("/api/sensors", methods=["GET"])
def get_sensor_readings():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 100"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.route("/api/alerts", methods=["POST"])
def create_alert():
    data = request.get_json(silent=True) or {}

    title = data.get("title")
    risk_level = data.get("risk_level")
    message = data.get("message")

    if not all((title, risk_level, message)):
        return jsonify({
            "error": "title, risk_level and message are required"
        }), 400

    if risk_level not in ("Normal", "Warning", "Critical"):
        return jsonify({"error": "Invalid risk_level"}), 400

    created_at = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute(
            """INSERT INTO alerts
               (title, risk_level, message, status, created_at)
               VALUES (?, ?, ?, 'Active', ?)""",
            (title, risk_level, message, created_at)
        )
        alert_id = cursor.lastrowid

    return jsonify({
        "message": "Alert saved",
        "id": alert_id,
        "status": "Active",
        "created_at": created_at
    }), 201


@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM alerts ORDER BY id DESC LIMIT 100"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.route("/api/alerts/<int:alert_id>/acknowledge", methods=["PATCH"])
def acknowledge_alert(alert_id):
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE alerts SET status = 'Acknowledged' "
            "WHERE id = ? AND status = 'Active'",
            (alert_id,)
        )

        if cursor.rowcount == 0:
            existing = connection.execute(
                "SELECT id FROM alerts WHERE id = ?", (alert_id,)
            ).fetchone()

            if existing is None:
                return jsonify({"error": "Alert not found"}), 404

            return jsonify({"error": "Alert is not active"}), 409

    return jsonify({
        "message": "Alert acknowledged",
        "id": alert_id,
        "status": "Acknowledged"
    })
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "Flask backend is running."
    })

if __name__ == "__main__":
    app.run(debug=True)
