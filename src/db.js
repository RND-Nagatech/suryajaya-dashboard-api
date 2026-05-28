const { MongoClient } = require("mongodb");

class MongoConnections {
  constructor(config) {
    this.config = config;
    this.grosirClient = null;
    this.pusatClient = null;
    this.dashboardClient = null;
    this.grosirDb = null;
    this.pusatDb = null;
    this.dashboardDb = null;
  }

  async connect() {
    const connectionOptions = {
      readPreference: "secondary"
    };

    this.grosirClient = new MongoClient(this.config.grosirMongoUri, connectionOptions);
    this.pusatClient = new MongoClient(this.config.pusatMongoUri, connectionOptions);

    const clients = [this.grosirClient.connect(), this.pusatClient.connect()];

    if (this.config.dashboardMongoUri) {
      this.dashboardClient = new MongoClient(this.config.dashboardMongoUri, connectionOptions);
      clients.push(this.dashboardClient.connect());
    }

    await Promise.all(clients);

    this.grosirDb = this.grosirClient.db(this.config.grosirDbName);
    this.pusatDb = this.pusatClient.db(this.config.pusatDbName);
    if (this.dashboardClient) {
      this.dashboardDb = this.dashboardClient.db(this.config.dashboardDbName);
    }
  }

  getDbs() {
    if (!this.grosirDb || !this.pusatDb) {
      throw new Error("Mongo connections are not initialized.");
    }

    return {
      grosirDb: this.grosirDb,
      pusatDb: this.pusatDb,
      dashboardDb: this.dashboardDb || null,
      getBranchDb: (dbName) => this.pusatClient.db(dbName),
      listBranchDbNames: async () => {
        const result = await this.pusatClient.db().admin().listDatabases();
        return result.databases.map((db) => db.name);
      }
    };
  }

  async close() {
    const clients = [this.grosirClient, this.pusatClient, this.dashboardClient].filter(Boolean);
    await Promise.all(clients.map((c) => c.close()));
  }
}

module.exports = {
  MongoConnections
};
