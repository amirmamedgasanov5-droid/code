package app.orbit

import android.app.Application
import app.orbit.engine.Engine
import app.orbit.live.LiveManager
import app.orbit.engine.Notifier
import app.orbit.engine.TransportManager

class OrbitApp : Application() {
    lateinit var engine: Engine
    lateinit var transports: TransportManager
    lateinit var live: LiveManager
    override fun onCreate() {
        super.onCreate()
        engine = Engine(this)
        engine.notifier = Notifier(this)
        transports = TransportManager(this, engine)
        live = LiveManager(this, engine)
        engine.boot()
    }
}
