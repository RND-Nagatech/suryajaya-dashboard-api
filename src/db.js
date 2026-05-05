const { MongoClient } = require("mongodb");

class MongoConnections {
  constructor(config) {
    this.config = config;
    this.grosirClient = null;
    this.pusatClient = null;
    this.grosirDb = null;
    this.pusatDb = null;
  }

  async connect() {
    const connectionOptions = {
      readPreference: "secondary"
    };

    this.grosirClient = new MongoClient(this.config.grosirMongoUri, connectionOptions);
    this.pusatClient = new MongoClient(this.config.pusatMongoUri, connectionOptions);

    await this.grosirClient.connect();
    await this.pusatClient.connect();

    this.grosirDb = this.grosirClient.db(this.config.grosirDbName);
    this.pusatDb = this.pusatClient.db(this.config.pusatDbName);
  }

  getDbs() {
    if (!this.grosirDb || !this.pusatDb) {
      throw new Error("Mongo connections are not initialized.");
    }

    return {
      grosirDb: this.grosirDb,
      pusatDb: this.pusatDb,
      getBranchDb: (dbName) => this.pusatClient.db(dbName),
      listBranchDbNames: async () => {
        const result = await this.pusatClient.db().admin().listDatabases();
        return result.databases.map((db) => db.name);
      }
    };
  }

  async close() {
    await Promise.all([
      this.grosirClient ? this.grosirClient.close() : Promise.resolve(),
      this.pusatClient ? this.pusatClient.close() : Promise.resolve()
    ]);
  }
}

module.exports = {
  MongoConnections
};
