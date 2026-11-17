package app.orbit.engine

import app.orbit.core.*
import org.json.JSONObject

/** Application payload inside an envelope: small JSON header + optional binary attachment. */
object Pay {
    class Dec(val j: JSONObject, val blob: ByteArray)
    fun enc(j: JSONObject, blob: ByteArray? = null): ByteArray =
        ByteWriter((blob?.size ?: 0) + 256).u8(1).bytes(j.toString().utf8()).bytes(blob ?: ByteArray(0)).toByteArray()
    fun dec(b: ByteArray): Dec? = try {
        val r = ByteReader(b); require(r.u8() == 1)
        Dec(JSONObject(r.bytes().str()), r.bytes())
    } catch (e: Exception) { null }
}
