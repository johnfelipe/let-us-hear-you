var request = require('request');
var nodefn = require('when/node');
var Cloudant = require('cloudant');

function processEvent(params) {
  var lowAngerChance = params.attributes.emotions.anger.score < 0.5;
  var lowDisgustChance = params.attributes.emotions.disgust.score < 0.5;

  if (lowAngerChance && lowDisgustChance) {
    return;
  }

  sendSms(params)
    .then(insertEvent.bind(null, params))
    .then(reportSuccess)
    .catch(handleError.bind(null, params))

  return whisk.async();
}

function sendSms(params) {
  return nodefn.call(request, {
    url: params.twilio_url + '/Accounts/' + params.twilio_sid + '/Messages.json',
    method: 'POST',
    form: {
      From: params.twilio_phone_number,
      To: params.manager_phone_number,
      Body: 'Negative feedback detected: ' + params.aggregate_id
    },
    auth: {
      username: params.twilio_sid,
      password: params.twilio_access_key
    }
  });
}

function insertEvent(params) {
  return databaseInsert(params, {
    type: 'event',
    name: 'SmsNotificationSent',
    aggregate_type: 'feedback',
    aggregate_id: params.aggregate_id,
    timestamp: +new Date(),
    attributes: {}
  });
}

function ignoreEvent(params) {
  var notAnEvent = params.type !== 'event';
  var notEmotionsAnalyzed = params.name !== 'EmotionsAnalyzed';

  return notAnEvent || notEmotionsAnalyzed;
}

function databaseInsert(params, record) {
  var database = Cloudant(params.cloudant_url).use(params.cloudant_db);
  return nodefn.call(database.insert.bind(database), record);
}

function main(params) {
  try {
    return ignoreEvent(params) ? null : processEvent(params);
  } catch (error) {
    handleError(params, error);
    return whisk.async();
  }
}

function reportSuccess() {
  whisk.done();
}

function handleError(params, error) {
  console.log(params);
  console.log(error);
  console.log(error.stack);

  return databaseInsert(params, {
    type: 'event',
    name: 'ErrorOccurred',
    aggregate_type: 'feedback',
    aggregate_id: params.aggregate_id,
    timestamp: +new Date(),
    attributes: {
      error: error.message
    }
  })
  .catch(function() {})
  .then(function() {
    whisk.done({ error: error });
  });
}
